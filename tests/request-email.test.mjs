import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";

const projectRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();
const REQUEST_ID = "10000000-0000-4000-8000-000000000001";

function loadProjectModule(relativePath, overrides = new Map(), cache = new Map()) {
  const filename = path.resolve(projectRoot, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;

  const source = projectRequire("node:fs").readFileSync(filename, "utf8");
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const { code } = transformSync(source, {
    filename,
    jsc: {
      parser: { syntax: "typescript", tsx: filename.endsWith(".tsx") },
      target: "es2022",
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
  });

  function loadLocal(candidate) {
    for (const extension of ["", ".ts", ".tsx"]) {
      try {
        return loadProjectModule(
          path.relative(projectRoot, `${candidate}${extension}`),
          overrides,
          cache,
        );
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    throw Object.assign(new Error(`Cannot resolve ${candidate}`), { code: "ENOENT" });
  }

  function localRequire(specifier) {
    if (overrides.has(specifier)) return overrides.get(specifier);
    if (specifier.startsWith("@/")) {
      return loadLocal(path.resolve(projectRoot, specifier.slice(2)));
    }
    if (specifier.startsWith(".")) {
      return loadLocal(path.resolve(path.dirname(filename), specifier));
    }
    return projectRequire(specifier);
  }

  new Function("require", "module", "exports", code)(
    localRequire,
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}

function officialSource() {
  return {
    id: REQUEST_ID,
    requestNumber: 42,
    requestedAt: "2026-08-31T09:30:00.000Z",
    requesterName: "Mario Rossi",
    project: "Progetto <script>alert(1)</script>",
    toolLine: "Linea 1",
    utilities: "Aria compressa",
    notes: "Consegna urgente",
    status: "in_preparazione",
    lines: [],
  };
}

function withEmailEnvironment(run) {
  const names = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "WAREHOUSE_EMAILS"];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "Fabtek Warehouse <warehouse@fabtek.example>";
  process.env.WAREHOUSE_EMAILS = "mario@example.com, buyer@fabtek.example,mario@example.com";

  return Promise.resolve(run()).finally(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("submitting a request emails the requester and warehouse with the generated PDF", async () => {
  await withEmailEnvironment(async () => {
    const sends = [];
    const pdf = Buffer.from("%PDF-request-42");
    class Resend {
      constructor(apiKey) {
        assert.equal(apiKey, "re_test_key");
        this.emails = {
          send: async (message, options) => {
            sends.push({ message, options });
            return { data: { id: "email-1" }, error: null };
          },
        };
      }
    }
    const overrides = new Map([
      ["server-only", {}],
      ["resend", { Resend }],
      ["@/lib/auth/current-profile", {
        async requirePermission() {
          return { id: "profile-1", full_name: "Mario Rossi", role: "user", is_active: true };
        },
        async getCurrentUserEmail() { return "mario@example.com"; },
      }],
      ["@/lib/domain/requests/submit-request", {
        async submitMaterialRequest() {
          return { ok: true, data: { requestId: REQUEST_ID, requestNumber: 42 } };
        },
      }],
      ["@/lib/data/documents", {
        async loadAuthorizedOfficialPdfSource(requestId, kind) {
          assert.equal(requestId, REQUEST_ID);
          assert.equal(kind, "initial_request");
          return officialSource();
        },
      }],
      ["@/lib/domain/documents/on-demand-pdf", {
        async createOnDemandPdf(source, kind) {
          assert.equal(source.id, REQUEST_ID);
          assert.equal(kind, "initial_request");
          return { buffer: pdf, filename: "fabtek-richiesta-000042.pdf" };
        },
      }],
      ["next/cache", { revalidatePath() {} }],
    ]);
    const { submitRequestAction } = loadProjectModule(
      "app/(app)/richieste/nuova/actions.ts",
      overrides,
    );

    const result = await submitRequestAction({ valid: "input" });

    assert.deepEqual(result, {
      ok: true,
      data: { requestId: REQUEST_ID, requestNumber: 42 },
    });
    assert.equal(sends.length, 1);
    const [{ message, options }] = sends;
    assert.equal(message.from, "Fabtek Warehouse <warehouse@fabtek.example>");
    assert.deepEqual(message.to, ["mario@example.com"]);
    assert.deepEqual(message.bcc, ["mario@example.com", "buyer@fabtek.example"]);
    assert.equal(message.subject, "Richiesta materiale #42 ricevuta");
    assert.match(message.html, /Mario Rossi/u);
    assert.match(message.html, /Progetto &lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
    assert.doesNotMatch(message.html, /<script>/u);
    assert.match(message.text, /Progetto <script>alert\(1\)<\/script>/u);
    assert.deepEqual(message.attachments, [{
      content: pdf,
      filename: "fabtek-richiesta-000042.pdf",
    }]);
    assert.deepEqual(options, { idempotencyKey: `request-submitted/${REQUEST_ID}` });
  });
});

test("email delivery failure does not turn a created request into a failed submission", async () => {
  await withEmailEnvironment(async () => {
    const reported = [];
    const originalConsoleError = console.error;
    class Resend {
      constructor() {
        this.emails = {
          async send() {
            return { data: null, error: { name: "rate_limit_exceeded" } };
          },
        };
      }
    }
    const overrides = new Map([
      ["server-only", {}],
      ["resend", { Resend }],
      ["@/lib/auth/current-profile", {
        async requirePermission() {
          return { id: "profile-1", full_name: "Mario Rossi", role: "user", is_active: true };
        },
        async getCurrentUserEmail() { return "mario@example.com"; },
      }],
      ["@/lib/domain/requests/submit-request", {
        async submitMaterialRequest() {
          return { ok: true, data: { requestId: REQUEST_ID, requestNumber: 42 } };
        },
      }],
      ["@/lib/data/documents", {
        async loadAuthorizedOfficialPdfSource() { return officialSource(); },
      }],
      ["@/lib/domain/documents/on-demand-pdf", {
        async createOnDemandPdf() {
          return {
            buffer: Buffer.from("%PDF-request-42"),
            filename: "fabtek-richiesta-000042.pdf",
          };
        },
      }],
      ["next/cache", { revalidatePath() {} }],
    ]);

    try {
      console.error = (...args) => reported.push(args);
      const { submitRequestAction } = loadProjectModule(
        "app/(app)/richieste/nuova/actions.ts",
        overrides,
      );

      const result = await submitRequestAction({ valid: "input" });

      assert.deepEqual(result, {
        ok: true,
        data: { requestId: REQUEST_ID, requestNumber: 42 },
      });
      assert.deepEqual(reported, [[
        "Request submitted email failed",
        { requestId: REQUEST_ID, errorCode: "EMAIL_DELIVERY_FAILED" },
      ]]);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
