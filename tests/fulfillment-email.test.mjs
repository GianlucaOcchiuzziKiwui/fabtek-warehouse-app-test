import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";

const projectRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();
const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_LINE_ID = "20000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "30000000-0000-4000-8000-000000000001";

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
        return loadProjectModule(path.relative(projectRoot, `${candidate}${extension}`), overrides, cache);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    throw Object.assign(new Error(`Cannot resolve ${candidate}`), { code: "ENOENT" });
  }

  function localRequire(specifier) {
    if (overrides.has(specifier)) return overrides.get(specifier);
    if (specifier.startsWith("@/")) return loadLocal(path.resolve(projectRoot, specifier.slice(2)));
    if (specifier.startsWith(".")) return loadLocal(path.resolve(path.dirname(filename), specifier));
    return projectRequire(specifier);
  }

  new Function("require", "module", "exports", code)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function officialSource(status = "evasa_parziale") {
  return {
    id: REQUEST_ID,
    requestNumber: 42,
    requestedAt: "2026-08-31T09:30:00.000Z",
    requesterName: "Mario Rossi",
    project: "Progetto Alfa",
    toolLine: "Linea 1",
    utilities: "Aria compressa",
    notes: null,
    status,
    lines: [{
      id: REQUEST_LINE_ID,
      fabtekCode: "FT-001",
      oracleSapioCode: "SAP-001",
      categoryName: "Processo",
      familyName: "Tubi",
      componentName: "Tubo PTFE",
      description: "Tubo tecnico",
      diameter: "12 mm",
      material: "PTFE",
      connection: "1/2 NPT",
      unitOfMeasure: "m",
      requestedQuantity: 10,
      fulfilledQuantity: status === "evasa" ? 10 : 4,
      fulfillments: [],
    }],
  };
}

function withEmailEnvironment(run) {
  const names = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "WAREHOUSE_EMAILS"];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "Fabtek Warehouse <warehouse@fabtek.example>";
  process.env.WAREHOUSE_EMAILS = "mario@example.com, buyer@fabtek.example";
  return Promise.resolve(run()).finally(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("a partial fulfillment emails its authoritative data with the current request PDF", async () => {
  await withEmailEnvironment(async () => {
    const sends = [];
    const pdf = Buffer.from("%PDF-partial");
    class Resend {
      constructor() {
        this.emails = {
          send: async (message, options) => {
            sends.push({ message, options });
            return { data: { id: "email-partial" }, error: null };
          },
        };
      }
    }
    const overrides = new Map([
      ["server-only", {}],
      ["resend", { Resend }],
      ["@/lib/auth/current-profile", { async requirePermission() {} }],
      ["@/lib/domain/fulfillment/fulfill-request-line", {
        async fulfillRequestLine() {
          return { ok: true, data: {
            requestId: REQUEST_ID,
            requestLineId: REQUEST_LINE_ID,
            idempotencyKey: IDEMPOTENCY_KEY,
            fulfilledQuantity: 4,
            remainingQuantity: 6,
            lineStatus: "evasa_parziale",
            requestStatus: "evasa_parziale",
          } };
        },
      }],
      ["@/lib/data/request-notifications", {
        async loadAuthorizedFulfillmentNotification() {
          return {
            requesterEmail: "mario@example.com",
            deliveredQuantity: 4,
            notes: "Consegna <script>alert(1)</script>",
          };
        },
      }],
      ["@/lib/data/documents", {
        async loadAuthorizedOfficialPdfSource(_requestId, kind) {
          assert.equal(kind, "initial_request");
          return officialSource();
        },
      }],
      ["@/lib/domain/documents/on-demand-pdf", {
        async createOnDemandPdf(_source, kind) {
          assert.equal(kind, "initial_request");
          return { buffer: pdf, filename: "fabtek-richiesta-000042.pdf" };
        },
      }],
      ["next/cache", { revalidatePath() {} }],
    ]);
    const { fulfillRequestLineAction } = loadProjectModule(
      "app/(app)/admin/richieste/actions.ts",
      overrides,
    );

    const result = await fulfillRequestLineAction({ valid: "input" });

    assert.equal(result.ok, true);
    assert.equal(sends.length, 1);
    const [{ message, options }] = sends;
    assert.deepEqual(message.to, ["mario@example.com"]);
    assert.deepEqual(message.bcc, ["mario@example.com", "buyer@fabtek.example"]);
    assert.equal(message.subject, "Richiesta materiale #42 aggiornata");
    assert.match(message.html, /FT-001/u);
    assert.match(message.text, /Quantità consegnata: 4 m/u);
    assert.match(message.text, /Quantità residua: 6 m/u);
    assert.match(message.text, /Consegna <script>alert\(1\)<\/script>/u);
    assert.doesNotMatch(message.html, /<script>/u);
    assert.match(message.html, /Consegna &lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
    assert.deepEqual(message.attachments, [{
      content: pdf,
      filename: "fabtek-richiesta-000042.pdf",
    }]);
    assert.deepEqual(options, { idempotencyKey: `request-fulfilled/${IDEMPOTENCY_KEY}` });
  });
});

test("the fulfillment completing a request emails the final report", async () => {
  await withEmailEnvironment(async () => {
    const sends = [];
    const pdf = Buffer.from("%PDF-final");
    class Resend {
      constructor() {
        this.emails = {
          send: async (message, options) => {
            sends.push({ message, options });
            return { data: { id: "email-final" }, error: null };
          },
        };
      }
    }
    const overrides = new Map([
      ["server-only", {}],
      ["resend", { Resend }],
      ["@/lib/auth/current-profile", { async requirePermission() {} }],
      ["@/lib/domain/fulfillment/fulfill-request-line", {
        async fulfillRequestLine() {
          return { ok: true, data: {
            requestId: REQUEST_ID,
            requestLineId: REQUEST_LINE_ID,
            idempotencyKey: IDEMPOTENCY_KEY,
            fulfilledQuantity: 10,
            remainingQuantity: 0,
            lineStatus: "evasa",
            requestStatus: "evasa",
          } };
        },
      }],
      ["@/lib/data/request-notifications", {
        async loadAuthorizedFulfillmentNotification() {
          return {
            requesterEmail: "mario@example.com",
            deliveredQuantity: 6,
            notes: null,
          };
        },
      }],
      ["@/lib/data/documents", {
        async loadAuthorizedOfficialPdfSource(_requestId, kind) {
          assert.equal(kind, "final_report");
          return officialSource("evasa");
        },
      }],
      ["@/lib/domain/documents/on-demand-pdf", {
        async createOnDemandPdf(_source, kind) {
          assert.equal(kind, "final_report");
          return { buffer: pdf, filename: "fabtek-report-finale-000042.pdf" };
        },
      }],
      ["next/cache", { revalidatePath() {} }],
    ]);
    const { fulfillRequestLineAction } = loadProjectModule(
      "app/(app)/admin/richieste/actions.ts",
      overrides,
    );

    await fulfillRequestLineAction({ valid: "input" });

    assert.equal(sends.length, 1);
    const [{ message, options }] = sends;
    assert.equal(message.subject, "Richiesta materiale #42 completata");
    assert.match(message.text, /Quantità consegnata: 6 m/u);
    assert.match(message.text, /Quantità residua: 0 m/u);
    assert.match(message.text, /Stato richiesta: Evasa/u);
    assert.deepEqual(message.attachments, [{
      content: pdf,
      filename: "fabtek-report-finale-000042.pdf",
    }]);
    assert.deepEqual(options, { idempotencyKey: `request-fulfilled/${IDEMPOTENCY_KEY}` });
  });
});

test("whole-request fulfillment authorizes once and sends one final notification", async () => {
  let permissionChecks = 0;
  let fulfillmentCalls = 0;
  let notificationCalls = 0;
  const revalidated = [];
  const expected = {
    requestId: REQUEST_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    fulfilledLineCount: 3,
    requestStatus: "evasa",
  };
  const overrides = new Map([
    ["@/lib/auth/current-profile", {
      async requirePermission(permission) {
        assert.equal(permission, "requests:manage");
        permissionChecks += 1;
      },
    }],
    ["@/lib/domain/fulfillment/fulfill-request-line", {}],
    ["@/lib/domain/fulfillment/fulfill-whole-request", {
      async fulfillWholeRequest(input) {
        fulfillmentCalls += 1;
        assert.deepEqual(input, { valid: "bulk" });
        return { ok: true, data: expected };
      },
    }],
    ["@/lib/email/request-fulfilled", {
      FulfillmentEmailError: class extends Error {},
      async sendRequestFulfilledEmail() {},
      async sendWholeRequestFulfilledEmail(result) {
        notificationCalls += 1;
        assert.equal(result, expected);
      },
    }],
    ["next/cache", {
      revalidatePath(pathname) {
        revalidated.push(pathname);
      },
    }],
  ]);
  const { fulfillWholeRequestAction } = loadProjectModule(
    "app/(app)/admin/richieste/actions.ts",
    overrides,
  );

  const result = await fulfillWholeRequestAction({ valid: "bulk" });

  assert.deepEqual(result, { ok: true, data: expected });
  assert.equal(permissionChecks, 1);
  assert.equal(fulfillmentCalls, 1);
  assert.equal(notificationCalls, 1);
  assert.deepEqual(revalidated, [
    "/admin/richieste",
    `/richieste/${REQUEST_ID}`,
  ]);
});

test("whole-request completion email describes the batch and attaches the final report", async () => {
  await withEmailEnvironment(async () => {
    const sends = [];
    const pdf = Buffer.from("%PDF-whole-request");
    class Resend {
      constructor() {
        this.emails = {
          send: async (message, options) => {
            sends.push({ message, options });
            return { data: { id: "email-whole" }, error: null };
          },
        };
      }
    }
    const overrides = new Map([
      ["server-only", {}],
      ["resend", { Resend }],
      ["@/lib/data/request-notifications", {
        async loadAuthorizedFulfillmentNotification() {},
        async loadAuthorizedWholeRequestNotification(input) {
          assert.deepEqual(input, {
            requestId: REQUEST_ID,
          });
          return { requesterEmail: "mario@example.com" };
        },
      }],
      ["@/lib/data/documents", {
        async loadAuthorizedOfficialPdfSource(requestId, kind) {
          assert.equal(requestId, REQUEST_ID);
          assert.equal(kind, "final_report");
          return officialSource("evasa");
        },
      }],
      ["@/lib/domain/documents/on-demand-pdf", {
        async createOnDemandPdf(_source, kind) {
          assert.equal(kind, "final_report");
          return { buffer: pdf, filename: "fabtek-report-finale-000042.pdf" };
        },
      }],
    ]);
    const { sendWholeRequestFulfilledEmail } = loadProjectModule(
      "lib/email/request-fulfilled.ts",
      overrides,
    );

    await sendWholeRequestFulfilledEmail({
      requestId: REQUEST_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      fulfilledLineCount: 3,
      requestStatus: "evasa",
    });

    assert.equal(sends.length, 1);
    const [{ message, options }] = sends;
    assert.equal(message.subject, "Richiesta materiale #42 completata");
    assert.match(message.text, /3 righe evase completamente/u);
    assert.deepEqual(message.attachments, [{
      content: pdf,
      filename: "fabtek-report-finale-000042.pdf",
    }]);
    assert.deepEqual(options, {
      idempotencyKey: `request-fulfilled/${IDEMPOTENCY_KEY}`,
    });
  });
});

test("a failed whole-request email returns a retryable result with the committed request id", async () => {
  const revalidated = [];
  const expected = {
    requestId: REQUEST_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    fulfilledLineCount: 3,
    requestStatus: "evasa",
  };
  const overrides = new Map([
    ["@/lib/auth/current-profile", { async requirePermission() {} }],
    ["@/lib/domain/fulfillment/fulfill-request-line", {}],
    ["@/lib/domain/fulfillment/fulfill-whole-request", {
      async fulfillWholeRequest() {
        return { ok: true, data: expected };
      },
    }],
    ["@/lib/email/request-fulfilled", {
      FulfillmentEmailError: class extends Error {
        constructor() {
          super("email failed");
          this.code = "EMAIL_DELIVERY_FAILED";
        }
      },
      async sendRequestFulfilledEmail() {},
      async sendWholeRequestFulfilledEmail() {
        const error = new Error("email failed");
        error.code = "EMAIL_DELIVERY_FAILED";
        throw error;
      },
    }],
    ["next/cache", {
      revalidatePath(pathname) {
        revalidated.push(pathname);
      },
    }],
  ]);
  const { fulfillWholeRequestAction } = loadProjectModule(
    "app/(app)/admin/richieste/actions.ts",
    overrides,
  );

  const originalConsoleError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await fulfillWholeRequestAction({ valid: "bulk" });
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "FULFILLMENT_EMAIL_FAILED",
      message: "La richiesta è stata evasa, ma la notifica finale non è stata inviata. Riprova per inviarla senza evadere nuovamente le righe.",
    },
  });
  assert.deepEqual(revalidated, []);
});
