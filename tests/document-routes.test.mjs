import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        format: "module",
        url: "data:text/javascript,export%20{}",
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  createJobsHandler,
  runtime: jobsRuntime,
} = await import("../app/api/internal/jobs/route.ts");
const documentsModule = await import("../lib/data/documents.ts");

const DOCUMENT_ID = "50000000-0000-4000-8000-000000000001";
const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const STORAGE_PATH = `requests/${REQUEST_ID}/initial-request-v1-${"a".repeat(64)}.pdf`;

function authorizedDocumentClient(document, storageResult = {
  data: new Blob(["%PDF-private"]),
  error: null,
}) {
  const calls = [];
  const query = {
    select(value) {
      calls.push(["select", value]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    async maybeSingle() {
      return { data: document, error: null };
    },
  };
  const client = {
    from(table) {
      calls.push(["from", table]);
      return query;
    },
    storage: {
      from(bucket) {
        calls.push(["storage", bucket]);
        return {
          async download(path) {
            calls.push(["download", path]);
            return storageResult;
          },
        };
      },
    },
  };
  return { calls, client };
}

test("draft document route is authenticated, server-rendered, and non-cacheable", async () => {
  const source = await readFile("app/api/documents/draft/route.ts", "utf8");

  assert.doesNotMatch(source, /export const runtime/u);
  assert.match(source, /getCurrentProfile/u);
  assert.match(source, /can\(profile, "requests:create"\)/u);
  assert.match(source, /Content-Disposition/u);
  assert.match(source, /Cache-Control/u);
  assert.doesNotMatch(source, /window\.print/u);
});

test("authorized document download uses one session client for RLS metadata and private Storage", async () => {
  assert.equal(typeof documentsModule.getAuthorizedDocument, "function");
  const { calls, client } = authorizedDocumentClient({
    id: DOCUMENT_ID,
    request_id: REQUEST_ID,
    document_type: "initial_request",
    status: "completed",
    storage_path: STORAGE_PATH,
    request: { request_number: 17 },
  });
  let clientCreations = 0;

  const document = await documentsModule.getAuthorizedDocument(DOCUMENT_ID, {
    createClient: async () => {
      clientCreations += 1;
      return client;
    },
  });

  assert.equal(clientCreations, 1);
  assert.equal(document.filename, "fabtek-richiesta-000017.pdf");
  assert.equal(document.buffer.toString(), "%PDF-private");
  assert.deepEqual(calls.filter(([operation]) => operation === "storage"), [
    ["storage", "generated-documents"],
  ]);
  assert.deepEqual(calls.filter(([operation]) => operation === "download"), [
    ["download", STORAGE_PATH],
  ]);
});

test("authorized document download hides RLS-invisible, pending, and missing files", async () => {
  const cases = [
    { document: null },
    {
      document: {
        id: DOCUMENT_ID,
        request_id: REQUEST_ID,
        document_type: "initial_request",
        status: "pending",
        storage_path: null,
        request: { request_number: 17 },
      },
    },
  ];

  for (const testCase of cases) {
    const { calls, client } = authorizedDocumentClient(testCase.document);
    const document = await documentsModule.getAuthorizedDocument(DOCUMENT_ID, {
      createClient: async () => client,
    });
    assert.equal(document, null);
    assert.equal(calls.some(([operation]) => operation === "download"), false);
  }

  const missingFile = authorizedDocumentClient({
    id: DOCUMENT_ID,
    request_id: REQUEST_ID,
    document_type: "initial_request",
    status: "completed",
    storage_path: STORAGE_PATH,
    request: { request_number: 17 },
  }, { data: null, error: { status: 404, statusCode: "NoSuchKey" } });
  assert.equal(await documentsModule.getAuthorizedDocument(DOCUMENT_ID, {
    createClient: async () => missingFile.client,
  }), null);
});

test("official document route returns 404 for a realistic missing Storage object", async () => {
  const route = await import("../app/api/documents/[documentId]/route.ts");
  const missingFile = authorizedDocumentClient({
    id: DOCUMENT_ID,
    request_id: REQUEST_ID,
    document_type: "initial_request",
    status: "completed",
    storage_path: STORAGE_PATH,
    request: { request_number: 17 },
  }, { data: null, error: { status: 404, statusCode: "NoSuchKey" } });
  const handler = route.createDocumentDownloadHandler({
    getProfile: async () => ({
      id: "30000000-0000-4000-8000-000000000001",
      full_name: "Mario Rossi",
      role: "user",
      is_active: true,
    }),
    getDocument: (documentId) => documentsModule.getAuthorizedDocument(documentId, {
      createClient: async () => missingFile.client,
    }),
    reportFailure: () => {},
  });

  const response = await handler(new Request("http://localhost"), {
    params: Promise.resolve({ documentId: DOCUMENT_ID }),
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Documento non trovato." });
});

test("authorized document download preserves infrastructure failures as safe repository and route errors", async () => {
  const unavailableStorage = authorizedDocumentClient({
    id: DOCUMENT_ID,
    request_id: REQUEST_ID,
    document_type: "initial_request",
    status: "completed",
    storage_path: STORAGE_PATH,
    request: { request_number: 17 },
  }, { data: null, error: { status: 503, statusCode: "InternalError" } });

  await assert.rejects(
    documentsModule.getAuthorizedDocument(DOCUMENT_ID, {
      createClient: async () => unavailableStorage.client,
    }),
    (error) => error?.code === "DOWNLOAD_AUTHORIZED_DOCUMENT_FAILED",
  );

  const route = await import("../app/api/documents/[documentId]/route.ts");
  const reports = [];
  const handler = route.createDocumentDownloadHandler({
    getProfile: async () => ({
      id: "30000000-0000-4000-8000-000000000001",
      full_name: "Mario Rossi",
      role: "user",
      is_active: true,
    }),
    getDocument: (documentId) => documentsModule.getAuthorizedDocument(documentId, {
      createClient: async () => unavailableStorage.client,
    }),
    reportFailure: (event) => reports.push(event),
  });
  const response = await handler(new Request("http://localhost"), {
    params: Promise.resolve({ documentId: DOCUMENT_ID }),
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Il documento non è disponibile in questo momento.",
  });
  assert.deepEqual(reports, [{
    operation: "download official document",
    errorCode: "DOWNLOAD_AUTHORIZED_DOCUMENT_FAILED",
  }]);
});

test("official document route enforces profile state and returns a private PDF download", async () => {
  const route = await import("../app/api/documents/[documentId]/route.ts");
  const activeProfile = {
    id: "30000000-0000-4000-8000-000000000001",
    full_name: "Mario Rossi",
    role: "user",
    is_active: true,
  };
  const downloaded = {
    buffer: Buffer.from("%PDF-private"),
    filename: "fabtek-richiesta-000017.pdf",
  };
  const context = { params: Promise.resolve({ documentId: DOCUMENT_ID }) };

  for (const [profile, status] of [[null, 401], [{ ...activeProfile, is_active: false }, 403]]) {
    const handler = route.createDocumentDownloadHandler({
      getProfile: async () => profile,
      getDocument: async () => downloaded,
      reportFailure: () => {},
    });
    assert.equal((await handler(new Request("http://localhost"), context)).status, status);
  }

  let loads = 0;
  const handler = route.createDocumentDownloadHandler({
    getProfile: async () => activeProfile,
    getDocument: async () => {
      loads += 1;
      return downloaded;
    },
    reportFailure: () => {},
  });
  assert.equal((await handler(new Request("http://localhost"), {
    params: Promise.resolve({ documentId: "invalid" }),
  })).status, 404);
  assert.equal(loads, 0);

  const response = await handler(new Request("http://localhost"), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(
    response.headers.get("Content-Disposition"),
    'attachment; filename="fabtek-richiesta-000017.pdf"',
  );
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "%PDF-private");
});

test("request detail exposes accessible document states and download labels", async () => {
  const source = await readFile("components/requests/request-detail.tsx", "utf8");

  assert.match(source, /<h2[^>]*>\s*Documenti/u);
  assert.match(source, /In preparazione/u);
  assert.match(source, /Non disponibile/u);
  assert.match(source, /href=\{`\/api\/documents\/\$\{document\.id\}`\}/u);
  assert.match(source, /aria-label=\{`Scarica PDF: \$\{document\.label\}`\}/u);
  assert.match(source, /min-h-10/u);
});

function schedulerDependencies(overrides = {}) {
  return {
    getConfig: () => ({
      jobSecret: "scheduler-secret",
      batchSize: 5,
      leaseSeconds: 300,
    }),
    processDocuments: async () => ({ claimed: 1, completed: 1, failed: 0 }),
    processNotifications: async () => ({ claimed: 1, completed: 1, failed: 0 }),
    compareSecrets: (expected, provided) => expected.equals(provided),
    reportFailure: () => {},
    ...overrides,
  };
}

test("scheduler uses the default Node runtime and constant-time comparison for a valid Bearer secret", async () => {
  const comparisons = [];
  const calls = [];
  const handler = createJobsHandler(schedulerDependencies({
    compareSecrets: (expected, provided) => {
      comparisons.push({ expected, provided });
      return expected.equals(provided);
    },
    processDocuments: async (options) => {
      calls.push(["documents", options]);
      return { claimed: 2, completed: 1, failed: 1 };
    },
    processNotifications: async (options) => {
      calls.push(["notifications", options]);
      return { claimed: 3, completed: 3, failed: 0 };
    },
  }));

  const response = await handler(new Request("http://localhost/api/internal/jobs", {
    method: "POST",
    headers: { Authorization: "Bearer scheduler-secret" },
  }));

  assert.equal(jobsRuntime, undefined);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    documents: { claimed: 2, completed: 1, failed: 1 },
    notifications: { claimed: 3, completed: 3, failed: 0 },
  });
  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].expected.toString(), "scheduler-secret");
  assert.equal(comparisons[0].provided.toString(), "scheduler-secret");
  assert.deepEqual(calls, [
    ["documents", { batchSize: 5, leaseSeconds: 300 }],
    ["notifications", { batchSize: 5, leaseSeconds: 300 }],
  ]);
});

test("scheduler rejects absent, malformed and wrong-length Bearer credentials without processing jobs", async () => {
  const processed = [];
  const comparisons = [];
  const handler = createJobsHandler(schedulerDependencies({
    compareSecrets: (expected, provided) => {
      comparisons.push({ expected, provided });
      return false;
    },
    processDocuments: async () => {
      processed.push("documents");
      return { claimed: 0, completed: 0, failed: 0 };
    },
    processNotifications: async () => {
      processed.push("notifications");
      return { claimed: 0, completed: 0, failed: 0 };
    },
  }));
  const headers = [
    undefined,
    "scheduler-secret",
    "Basic scheduler-secret",
    "Bearer",
    "Bearer scheduler-secret extra",
    "Bearer short",
  ];

  for (const authorization of headers) {
    const response = await handler(new Request("http://localhost/api/internal/jobs", {
      method: "POST",
      headers: authorization ? { Authorization: authorization } : {},
    }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { error: "UNAUTHORIZED" });
  }

  assert.equal(comparisons.length, 0);
  assert.equal(processed.length, 0);
});

test("scheduler rejects a malformed Bearer header before reading server configuration", async () => {
  let configReads = 0;
  const handler = createJobsHandler(schedulerDependencies({
    getConfig: () => {
      configReads += 1;
      throw new Error("missing scheduler secret");
    },
  }));

  const response = await handler(new Request("http://localhost/api/internal/jobs", {
    method: "POST",
    headers: { Authorization: "Basic malformed" },
  }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "UNAUTHORIZED" });
  assert.equal(configReads, 0);
});

test("scheduler isolates processor failures and reports only safe error metadata", async () => {
  const calls = [];
  const reports = [];
  const handler = createJobsHandler(schedulerDependencies({
    processDocuments: async () => {
      calls.push("documents");
      throw new Error("database password and job payload");
    },
    processNotifications: async () => {
      calls.push("notifications");
      return { claimed: 1, completed: 1, failed: 0 };
    },
    reportFailure: (event) => reports.push(event),
  }));

  const response = await handler(new Request("http://localhost/api/internal/jobs", {
    method: "POST",
    headers: { Authorization: "Bearer scheduler-secret" },
  }));
  const body = await response.json();

  assert.deepEqual(calls, ["documents", "notifications"]);
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, { error: "JOB_PROCESSING_FAILED" });
  assert.deepEqual(reports, [{
    phase: "documents",
    errorCode: "JOB_PROCESSOR_ERROR",
  }]);
  assert.equal(JSON.stringify({ body, reports }).includes("password"), false);
  assert.equal(JSON.stringify({ body, reports }).includes("payload"), false);
});
