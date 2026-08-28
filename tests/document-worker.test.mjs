import assert from "node:assert/strict";
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
    if (specifier.startsWith("@/")) {
      return {
        shortCircuit: true,
        url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  DocumentEnvironmentError,
  getEmailConfig,
  getWorkerConfig,
} = await import("../lib/env/documents.ts");
const {
  OfficialPdfMappingError,
  mapOfficialPdfDocument,
} = await import("../lib/pdf/mappers.ts");
const {
  DocumentDataError,
  claimGeneratedDocumentJobs,
  uploadGeneratedPdf,
} = await import("../lib/data/documents.ts");
const { createAdminClient } = await import("../lib/supabase/admin.ts");
const { processDocumentJobs } = await import("../lib/domain/documents/worker.ts");

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const JOB_ID = "20000000-0000-4000-8000-000000000001";
const LINE_ID = "30000000-0000-4000-8000-000000000001";

const job = {
  id: JOB_ID,
  requestId: REQUEST_ID,
  documentType: "initial_request",
  templateVersion: "1",
  attempts: 2,
  leaseExpiresAt: "2026-08-28T10:05:00.000Z",
};

const officialSource = {
  id: REQUEST_ID,
  requestNumber: 17,
  requestedAt: "2026-08-28T08:00:00.000Z",
  requesterName: "Mario Rossi",
  project: "Progetto 21",
  toolLine: "Linea A",
  utilities: "Aria compressa",
  notes: "Consegna urgente",
  status: "in_preparazione",
  lines: [{
    id: LINE_ID,
    fabtekCode: "FT-001",
    oracleSapioCode: "OR-900",
    categoryName: "Gas",
    familyName: "Flessibili",
    componentName: "Tubo",
    description: "Tubo flessibile PTFE",
    diameter: "DN10",
    material: "PTFE",
    connection: "1/2 NPT",
    unitOfMeasure: "m",
    requestedQuantity: 10,
    fulfilledQuantity: 0,
    fulfillments: [],
  }],
};

function workerDependencies(overrides = {}) {
  return {
    claimDocuments: async () => [job],
    loadSource: async () => officialSource,
    render: async () => Buffer.from("%PDF-test"),
    upload: async () => {},
    resolveNotification: () => ({
      recipients: ["magazzino@example.com"],
      subject: "Richiesta materiale #000017 - Progetto 21",
    }),
    completeDocument: async () => {},
    failDocument: async () => {},
    now: () => new Date("2026-08-28T10:00:00Z"),
    ...overrides,
  };
}

test("processes an official request in order with deterministic storage metadata and lease fencing", async () => {
  const calls = [];

  const result = await processDocumentJobs({ batchSize: 5 }, workerDependencies({
    claimDocuments: async (input) => {
      calls.push(["claim", input]);
      return [job];
    },
    loadSource: async (requestId) => {
      calls.push(["load", requestId]);
      return officialSource;
    },
    render: async (document) => {
      calls.push(["render", document]);
      return Buffer.from("%PDF-test");
    },
    upload: async (path, buffer) => {
      calls.push(["upload", { path, buffer }]);
    },
    resolveNotification: (source, kind) => {
      calls.push(["notification", { source, kind }]);
      return {
        recipients: ["magazzino@example.com"],
        subject: "Richiesta materiale #000017 - Progetto 21",
      };
    },
    completeDocument: async (input) => {
      calls.push(["complete", input]);
    },
  }));

  assert.deepEqual(result, { claimed: 1, completed: 1, failed: 0 });
  assert.deepEqual(calls.map(([name]) => name), [
    "claim",
    "load",
    "render",
    "upload",
    "notification",
    "complete",
  ]);
  assert.deepEqual(calls[0][1], { batchSize: 5, leaseSeconds: 300 });
  assert.equal(calls[2][1].lines[0].requestedQuantity, 10);
  assert.equal("fulfilledQuantity" in calls[2][1].lines[0], false);
  assert.equal(calls[3][1].path, `requests/${REQUEST_ID}/initial-request-v1.pdf`);
  assert.equal(calls[3][1].buffer.toString(), "%PDF-test");
  assert.equal(calls[5][1].jobId, JOB_ID);
  assert.equal(calls[5][1].attempts, 2);
  assert.equal(calls[5][1].storagePath, `requests/${REQUEST_ID}/initial-request-v1.pdf`);
  assert.match(calls[5][1].sha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(calls[5][1].recipients, ["magazzino@example.com"]);
});

test("maps a final report with fulfillment quantities and chronologically ordered events", async () => {
  const rendered = [];
  const reportJob = { ...job, documentType: "final_report", templateVersion: "7" };
  const reportSource = {
    ...officialSource,
    status: "evasa",
    lines: [{
      ...officialSource.lines[0],
      fulfilledQuantity: 10,
      fulfillments: [
        {
          id: "50000000-0000-4000-8000-000000000002",
          quantity: 4,
          fulfilledAt: "2026-08-28T09:30:00.000Z",
          notes: "Seconda evasione",
        },
        {
          id: "50000000-0000-4000-8000-000000000001",
          quantity: 6,
          fulfilledAt: "2026-08-28T09:00:00.000Z",
          notes: null,
        },
      ],
    }],
  };

  const result = await processDocumentJobs({}, workerDependencies({
    claimDocuments: async () => [reportJob],
    loadSource: async () => reportSource,
    render: async (document) => {
      rendered.push(document);
      return Buffer.from("%PDF-report");
    },
  }));

  assert.deepEqual(result, { claimed: 1, completed: 1, failed: 0 });
  assert.equal(rendered[0].kind, "final_report");
  assert.equal(rendered[0].lines[0].fulfilledQuantity, 10);
  assert.equal(rendered[0].lines[0].remainingQuantity, 0);
  assert.deepEqual(
    rendered[0].lines[0].fulfillments.map((event) => event.fulfilledAtLabel),
    ["28/08/2026, 11:00", "28/08/2026, 11:30"],
  );
});

test("fails only the current job after a render error and passes the claimed attempt to the retry RPC", async () => {
  const failures = [];
  const secondJob = {
    ...job,
    id: "20000000-0000-4000-8000-000000000002",
    requestId: "10000000-0000-4000-8000-000000000002",
  };

  const result = await processDocumentJobs({}, workerDependencies({
    claimDocuments: async () => [job, secondJob],
    render: async (document) => {
      if (document.project === "Progetto 21") throw new Error("renderer payload details");
      return Buffer.from("%PDF-test");
    },
    loadSource: async (requestId) => ({
      ...officialSource,
      id: requestId,
      project: requestId === REQUEST_ID ? "Progetto 21" : "Progetto 22",
    }),
    failDocument: async (input) => failures.push(input),
  }));

  assert.deepEqual(result, { claimed: 2, completed: 1, failed: 1 });
  assert.deepEqual(failures, [{
    jobId: JOB_ID,
    attempts: 2,
    error: "DOCUMENT_JOB_ERROR",
    retryAt: "2026-08-28T10:05:00.000Z",
    terminal: false,
  }]);
});

test("reuses the same storage path when atomic completion fails after upload", async () => {
  const uploads = [];
  const failures = [];
  let completionAttempts = 0;
  const dependencies = workerDependencies({
    upload: async (path) => uploads.push(path),
    completeDocument: async () => {
      completionAttempts += 1;
      if (completionAttempts === 1) throw new Error("database unavailable");
    },
    failDocument: async (input) => failures.push(input),
  });

  const first = await processDocumentJobs({}, dependencies);
  const second = await processDocumentJobs({}, dependencies);

  assert.deepEqual(first, { claimed: 1, completed: 0, failed: 1 });
  assert.deepEqual(second, { claimed: 1, completed: 1, failed: 0 });
  assert.deepEqual(uploads, [
    `requests/${REQUEST_ID}/initial-request-v1.pdf`,
    `requests/${REQUEST_ID}/initial-request-v1.pdf`,
  ]);
  assert.equal(failures[0].attempts, 2);
});

test("rejects incomplete official snapshots and inconsistent final fulfillment totals", () => {
  assert.throws(
    () => mapOfficialPdfDocument({
      ...officialSource,
      lines: [{ ...officialSource.lines[0], material: "" }],
    }, "initial_request"),
    (error) => error instanceof OfficialPdfMappingError
      && error.code === "INVALID_OFFICIAL_PDF_SOURCE",
  );
  assert.throws(
    () => mapOfficialPdfDocument({
      ...officialSource,
      status: "evasa",
      lines: [{
        ...officialSource.lines[0],
        fulfilledQuantity: 10,
        fulfillments: [{
          id: "50000000-0000-4000-8000-000000000001",
          quantity: 9,
          fulfilledAt: "2026-08-28T09:00:00.000Z",
          notes: null,
        }],
      }],
    }, "final_report"),
    (error) => error instanceof OfficialPdfMappingError
      && error.code === "INVALID_FINAL_REPORT_QUANTITIES",
  );
});

test("reads document configuration lazily, normalizes recipients and rejects unsafe values", () => {
  const previous = { ...process.env };
  try {
    delete process.env.JOB_RUNNER_SECRET;
    assert.throws(
      () => getWorkerConfig(),
      (error) => error instanceof DocumentEnvironmentError
        && error.code === "MISSING_DOCUMENT_ENV",
    );

    process.env.JOB_RUNNER_SECRET = "runner-secret";
    process.env.DOCUMENT_JOB_BATCH_SIZE = "20";
    process.env.DOCUMENT_JOB_LEASE_SECONDS = "30";
    assert.deepEqual(getWorkerConfig(), {
      jobSecret: "runner-secret",
      batchSize: 20,
      leaseSeconds: 30,
    });

    process.env.RESEND_API_KEY = "resend-key";
    process.env.EMAIL_FROM = "Fabtek <noreply@example.com>";
    process.env.REQUEST_EMAIL_RECIPIENTS = " Magazzino@example.com,admin@example.com,magazzino@example.com ";
    assert.deepEqual(getEmailConfig(), {
      apiKey: "resend-key",
      from: "Fabtek <noreply@example.com>",
      recipients: ["magazzino@example.com", "admin@example.com"],
    });

    process.env.DOCUMENT_JOB_BATCH_SIZE = "21";
    assert.throws(
      () => getWorkerConfig(),
      (error) => error instanceof DocumentEnvironmentError
        && error.code === "INVALID_DOCUMENT_ENV",
    );
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
});

test("validates claimed RPC rows and forwards bounded lease arguments", async () => {
  const calls = [];
  const jobs = await claimGeneratedDocumentJobs(
    { batchSize: 4, leaseSeconds: 120 },
    {
      createClient: () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return {
            data: [{
              id: JOB_ID,
              request_id: REQUEST_ID,
              document_type: "initial_request",
              template_version: "1",
              attempts: 2,
              lease_expires_at: "2026-08-28T10:05:00.000Z",
            }],
            error: null,
          };
        },
      }),
    },
  );

  assert.deepEqual(jobs, [job]);
  assert.deepEqual(calls, [{
    name: "claim_generated_document_jobs",
    args: { p_limit: 4, p_lease_seconds: 120 },
  }]);
});

test("maps thrown RPC and storage failures to stable document data errors", async () => {
  await assert.rejects(
    () => claimGeneratedDocumentJobs(
      { batchSize: 1, leaseSeconds: 30 },
      { createClient: () => ({ rpc: async () => { throw new Error("network secret"); } }) },
    ),
    (error) => error instanceof DocumentDataError
      && error.code === "CLAIM_DOCUMENTS_FAILED"
      && !error.message.includes("secret"),
  );

  await assert.rejects(
    () => uploadGeneratedPdf("requests/id/file.pdf", Buffer.from("%PDF"), {
      createClient: () => ({
        storage: {
          from: () => ({ upload: async () => { throw new Error("storage secret"); } }),
        },
      }),
    }),
    (error) => error instanceof DocumentDataError
      && error.code === "UPLOAD_GENERATED_PDF_FAILED"
      && !error.message.includes("secret"),
  );
});

test("uploads generated PDFs with overwrite-safe private storage metadata", async () => {
  const calls = [];
  await uploadGeneratedPdf(
    `requests/${REQUEST_ID}/initial-request-v1.pdf`,
    Buffer.from("%PDF"),
    {
      createClient: () => ({
        storage: {
          from: (bucket) => ({
            upload: async (path, buffer, options) => {
              calls.push({ bucket, path, buffer, options });
              return { error: null };
            },
          }),
        },
      }),
    },
  );

  assert.equal(calls[0].bucket, "generated-documents");
  assert.equal(calls[0].path, `requests/${REQUEST_ID}/initial-request-v1.pdf`);
  assert.deepEqual(calls[0].options, {
    upsert: true,
    contentType: "application/pdf",
    cacheControl: "0",
  });
});

test("rejects a non-HTTP Supabase URL before constructing a service-role client", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "ftp://database.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
    assert.throws(
      () => createAdminClient(),
      (error) => error instanceof DocumentEnvironmentError
        && error.code === "INVALID_DOCUMENT_ENV",
    );
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("resolves configured recipients and a normalized subject before atomic completion", async () => {
  const previous = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    recipients: process.env.REQUEST_EMAIL_RECIPIENTS,
  };
  try {
    process.env.RESEND_API_KEY = "resend-key";
    process.env.EMAIL_FROM = "Fabtek <noreply@example.com>";
    process.env.REQUEST_EMAIL_RECIPIENTS = "warehouse@example.com";
    const completions = [];
    const dependencies = workerDependencies({
      loadSource: async () => ({
        ...officialSource,
        project: "  Progetto\n 21  ",
      }),
      completeDocument: async (input) => completions.push(input),
    });
    delete dependencies.resolveNotification;

    const result = await processDocumentJobs({}, dependencies);

    assert.deepEqual(result, { claimed: 1, completed: 1, failed: 0 });
    assert.deepEqual(completions[0].recipients, ["warehouse@example.com"]);
    assert.equal(
      completions[0].subject,
      "Richiesta materiale #000017 - Progetto 21",
    );
  } finally {
    if (previous.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous.apiKey;
    if (previous.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previous.from;
    if (previous.recipients === undefined) delete process.env.REQUEST_EMAIL_RECIPIENTS;
    else process.env.REQUEST_EMAIL_RECIPIENTS = previous.recipients;
  }
});

test("keeps an uploaded document retryable when email configuration is missing", async () => {
  const previous = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    recipients: process.env.REQUEST_EMAIL_RECIPIENTS,
  };
  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.REQUEST_EMAIL_RECIPIENTS;
    const uploads = [];
    const failures = [];
    const dependencies = workerDependencies({
      upload: async (path) => uploads.push(path),
      failDocument: async (input) => failures.push(input),
    });
    delete dependencies.resolveNotification;

    const result = await processDocumentJobs({}, dependencies);

    assert.deepEqual(result, { claimed: 1, completed: 0, failed: 1 });
    assert.deepEqual(uploads, [
      `requests/${REQUEST_ID}/initial-request-v1.pdf`,
    ]);
    assert.equal(failures[0].error, "MISSING_DOCUMENT_ENV");
    assert.equal(failures[0].attempts, 2);
  } finally {
    if (previous.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous.apiKey;
    if (previous.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previous.from;
    if (previous.recipients === undefined) delete process.env.REQUEST_EMAIL_RECIPIENTS;
    else process.env.REQUEST_EMAIL_RECIPIENTS = previous.recipients;
  }
});
