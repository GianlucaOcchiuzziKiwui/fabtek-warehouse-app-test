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
  claimNotificationJobs,
  completeNotificationJob,
  DocumentDataError,
  downloadGeneratedPdf,
  failNotificationJob,
  loadCompletedGeneratedDocument,
  claimGeneratedDocumentJobs,
  uploadGeneratedPdf,
} = await import("../lib/data/documents.ts");
const { createAdminClient } = await import("../lib/supabase/admin.ts");
const {
  processDocumentJobs,
  processNotificationJobs,
} = await import("../lib/domain/documents/worker.ts");
const {
  DocumentEmailError,
  sendDocumentEmail,
} = await import("../lib/email/resend.ts");

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const JOB_ID = "20000000-0000-4000-8000-000000000001";
const LINE_ID = "30000000-0000-4000-8000-000000000001";
const NOTIFICATION_JOB_ID = "40000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "50000000-0000-4000-8000-000000000001";
const TEST_PDF_SHA256 = "3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63";
const STALE_PDF_SHA256 = "55899375fbc45517a38325d486737f3afb61ababaf25192b480d61129fb07798";
const CURRENT_PDF_SHA256 = "542be9e38348b0a9026ec6476c9860d2b94ffe8e69abe362f464acd49ecccbd0";

const job = {
  id: JOB_ID,
  requestId: REQUEST_ID,
  documentType: "initial_request",
  templateVersion: "1",
  attempts: 2,
  leaseExpiresAt: "2026-08-28T10:05:00.000Z",
};

const notificationJob = {
  id: NOTIFICATION_JOB_ID,
  requestId: REQUEST_ID,
  documentId: DOCUMENT_ID,
  documentType: "initial_request",
  recipients: ["warehouse@example.com"],
  subject: "CMKT_RDM_Linea A_Aria compressa_Mario Rossi_17",
  attempts: 2,
  leaseExpiresAt: "2026-08-28T10:05:00.000Z",
};

const completedDocument = {
  id: DOCUMENT_ID,
  requestId: REQUEST_ID,
  documentType: "initial_request",
  requestNumber: 17,
  storagePath: `requests/${REQUEST_ID}/initial-request-v1-${TEST_PDF_SHA256}.pdf`,
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

function notificationWorkerDependencies(overrides = {}) {
  return {
    claimNotifications: async () => [notificationJob],
    loadCompletedDocument: async () => completedDocument,
    download: async () => Buffer.from("%PDF-email"),
    sendEmail: async () => ({ providerMessageId: "provider-message-1" }),
    completeNotification: async () => {},
    failNotification: async () => {},
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
  assert.equal(
    calls[3][1].path,
    `requests/${REQUEST_ID}/initial-request-v1-${TEST_PDF_SHA256}.pdf`,
  );
  assert.equal(calls[3][1].buffer.toString(), "%PDF-test");
  assert.equal(calls[5][1].jobId, JOB_ID);
  assert.equal(calls[5][1].attempts, 2);
  assert.equal(
    calls[5][1].storagePath,
    `requests/${REQUEST_ID}/initial-request-v1-${TEST_PDF_SHA256}.pdf`,
  );
  assert.equal(calls[5][1].sha256, TEST_PDF_SHA256);
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
    `requests/${REQUEST_ID}/initial-request-v1-${TEST_PDF_SHA256}.pdf`,
    `requests/${REQUEST_ID}/initial-request-v1-${TEST_PDF_SHA256}.pdf`,
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

test("rejects a final report while any requested quantity remains unfulfilled", () => {
  assert.throws(
    () => mapOfficialPdfDocument({
      ...officialSource,
      status: "evasa",
      lines: [{
        ...officialSource.lines[0],
        fulfilledQuantity: 9,
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

test("content-addressed paths prevent a stale worker from overwriting the winning PDF", async () => {
  const objects = new Map();
  const winnerCompletions = [];
  let releaseStaleUpload;
  let staleUploadStarted;
  const staleUploadGate = new Promise((resolve) => { releaseStaleUpload = resolve; });
  const staleStarted = new Promise((resolve) => { staleUploadStarted = resolve; });
  const staleJob = { ...job, attempts: 2 };
  const currentJob = { ...job, attempts: 3 };

  const staleRun = processDocumentJobs({}, workerDependencies({
    claimDocuments: async () => [staleJob],
    render: async () => Buffer.from("%PDF-stale"),
    upload: async (path, buffer) => {
      staleUploadStarted();
      await staleUploadGate;
      objects.set(path, Buffer.from(buffer));
    },
    completeDocument: async () => {
      throw Object.assign(new Error("stale lease"), {
        code: "DOCUMENT_JOB_LEASE_LOST",
      });
    },
  }));

  await staleStarted;
  const currentResult = await processDocumentJobs({}, workerDependencies({
    claimDocuments: async () => [currentJob],
    render: async () => Buffer.from("%PDF-current"),
    upload: async (path, buffer) => objects.set(path, Buffer.from(buffer)),
    completeDocument: async (input) => winnerCompletions.push(input),
  }));
  releaseStaleUpload();
  const staleResult = await staleRun;

  const winner = winnerCompletions[0];
  assert.deepEqual(currentResult, { claimed: 1, completed: 1, failed: 0 });
  assert.deepEqual(staleResult, { claimed: 1, completed: 0, failed: 1 });
  assert.equal(objects.size, 2);
  assert.equal(winner.attempts, 3);
  assert.equal(winner.sha256, CURRENT_PDF_SHA256);
  assert.equal(
    winner.storagePath,
    `requests/${REQUEST_ID}/initial-request-v1-${CURRENT_PDF_SHA256}.pdf`,
  );
  assert.equal(objects.get(winner.storagePath).toString(), "%PDF-current");
  assert.equal(
    objects
      .get(`requests/${REQUEST_ID}/initial-request-v1-${STALE_PDF_SHA256}.pdf`)
      .toString(),
    "%PDF-stale",
  );
});

test("reports a safe persistence failure without stopping the remaining batch", async () => {
  const reports = [];
  const secondJob = {
    ...job,
    id: "20000000-0000-4000-8000-000000000002",
    requestId: "10000000-0000-4000-8000-000000000002",
  };
  const result = await processDocumentJobs({}, workerDependencies({
    claimDocuments: async () => [job, secondJob],
    loadSource: async (requestId) => ({
      ...officialSource,
      id: requestId,
      project: requestId === REQUEST_ID ? "Render failure" : "Valid job",
    }),
    render: async (document) => {
      if (document.project === "Render failure") throw new Error("render payload");
      return Buffer.from("%PDF-test");
    },
    failDocument: async () => {
      throw Object.assign(new Error("database credentials"), {
        code: "FAIL_DOCUMENT_JOB_FAILED",
      });
    },
    reportFailure: (event) => reports.push(event),
  }));

  assert.deepEqual(result, { claimed: 2, completed: 1, failed: 1 });
  assert.deepEqual(reports, [{
    jobId: JOB_ID,
    phase: "fail_document",
    attempt: 2,
    errorCode: "FAIL_DOCUMENT_JOB_FAILED",
  }]);
  assert.equal(JSON.stringify(reports).includes("credentials"), false);
  assert.equal(JSON.stringify(reports).includes("payload"), false);
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

test("resolves configured recipients and the exact normalized request subject", async () => {
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
        toolLine: "  Tool / Line # 55  ",
        utilities: " Aria\n  compressa ",
        requesterName: " Mário   Rossi ",
      }),
      completeDocument: async (input) => completions.push(input),
    });
    delete dependencies.resolveNotification;

    const result = await processDocumentJobs({}, dependencies);
    const reportDependencies = workerDependencies({
      claimDocuments: async () => [{ ...job, documentType: "final_report" }],
      loadSource: async () => ({
        ...officialSource,
        toolLine: "  Tool / Line # 55  ",
        utilities: " Aria\n  compressa ",
        requesterName: " Mário   Rossi ",
        status: "evasa",
        lines: [{
          ...officialSource.lines[0],
          fulfilledQuantity: 10,
          fulfillments: [{
            id: "50000000-0000-4000-8000-000000000001",
            quantity: 10,
            fulfilledAt: "2026-08-28T09:00:00.000Z",
            notes: null,
          }],
        }],
      }),
      completeDocument: async (input) => completions.push(input),
    });
    delete reportDependencies.resolveNotification;
    const reportResult = await processDocumentJobs({}, reportDependencies);

    assert.deepEqual(result, { claimed: 1, completed: 1, failed: 0 });
    assert.deepEqual(reportResult, { claimed: 1, completed: 1, failed: 0 });
    assert.deepEqual(completions[0].recipients, ["warehouse@example.com"]);
    assert.equal(
      completions[0].subject,
      "CMKT_RDM_Tool / Line # 55_Aria compressa_Mário Rossi_17",
    );
    assert.equal(
      completions[1].subject,
      "CMKT_RDM_Tool / Line # 55_Aria compressa_Mário Rossi_17_EVASA",
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
      `requests/${REQUEST_ID}/initial-request-v1-${TEST_PDF_SHA256}.pdf`,
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

test("sends a PDF attachment as base64 with a stable provider idempotency key", async () => {
  const clientKeys = [];
  const calls = [];

  const result = await sendDocumentEmail({
    apiKey: "resend-key",
    from: "Fabtek <noreply@example.com>",
    recipients: ["warehouse@example.com"],
    subject: "CMKT_RDM_Linea A_Aria compressa_Mario Rossi_17",
    attachment: {
      filename: "fabtek-richiesta-000017.pdf",
      buffer: Buffer.from("%PDF-email"),
    },
    idempotencyKey: `document-notification/${JOB_ID}`,
  }, {
    createClient: (apiKey) => {
      clientKeys.push(apiKey);
      return {
        emails: {
          send: async (payload, options) => {
            calls.push({ payload, options });
            return { data: { id: "provider-message-1" }, error: null };
          },
        },
      };
    },
  });

  assert.deepEqual(result, { providerMessageId: "provider-message-1" });
  assert.deepEqual(clientKeys, ["resend-key"]);
  assert.deepEqual(calls[0].options, {
    idempotencyKey: `document-notification/${JOB_ID}`,
  });
  assert.deepEqual(calls[0].payload.attachments, [{
    filename: "fabtek-richiesta-000017.pdf",
    content: Buffer.from("%PDF-email").toString("base64"),
  }]);
  assert.equal(calls[0].payload.to[0], "warehouse@example.com");
  assert.match(calls[0].payload.html, /documento richiesto/iu);
  assert.match(calls[0].payload.text, /documento richiesto/iu);
});

test("maps provider failures to a stable email error without leaking provider or recipient details", async () => {
  await assert.rejects(
    () => sendDocumentEmail({
      apiKey: "resend-key",
      from: "Fabtek <noreply@example.com>",
      recipients: ["sensitive-recipient@example.com"],
      subject: "Sensitive subject",
      attachment: {
        filename: "fabtek-richiesta-000017.pdf",
        buffer: Buffer.from("%PDF-email"),
      },
      idempotencyKey: `document-notification/${JOB_ID}`,
    }, {
      createClient: () => ({
        emails: {
          send: async () => ({
            data: null,
            error: { message: "provider rejected sensitive-recipient@example.com" },
          }),
        },
      }),
    }),
    (error) => error instanceof DocumentEmailError
      && error.code === "DOCUMENT_EMAIL_SEND_FAILED"
      && !error.message.includes("sensitive-recipient@example.com")
      && !error.message.includes("provider rejected"),
  );
});

test("rejects provider success responses without a message id", async () => {
  await assert.rejects(
    () => sendDocumentEmail({
      apiKey: "resend-key",
      from: "Fabtek <noreply@example.com>",
      recipients: ["warehouse@example.com"],
      subject: "CMKT_RDM_Linea A_Aria compressa_Mario Rossi_17",
      attachment: {
        filename: "fabtek-richiesta-000017.pdf",
        buffer: Buffer.from("%PDF-email"),
      },
      idempotencyKey: `document-notification/${JOB_ID}`,
    }, {
      createClient: () => ({
        emails: {
          send: async () => ({ data: {}, error: null }),
        },
      }),
    }),
    (error) => error instanceof DocumentEmailError
      && error.code === "DOCUMENT_EMAIL_SEND_FAILED",
  );
});

test("normalizes email client initialization failures", async () => {
  await assert.rejects(
    () => sendDocumentEmail({
      apiKey: "sensitive-resend-key",
      from: "Fabtek <noreply@example.com>",
      recipients: ["warehouse@example.com"],
      subject: "CMKT_RDM_Linea A_Aria compressa_Mario Rossi_17",
      attachment: {
        filename: "fabtek-richiesta-000017.pdf",
        buffer: Buffer.from("%PDF-email"),
      },
      idempotencyKey: `document-notification/${JOB_ID}`,
    }, {
      createClient: () => {
        throw new Error("invalid sensitive-resend-key");
      },
    }),
    (error) => error instanceof DocumentEmailError
      && error.code === "DOCUMENT_EMAIL_SEND_FAILED"
      && !error.message.includes("sensitive-resend-key"),
  );
});

test("sends an already completed PDF without invoking the renderer and completes the leased notification", async () => {
  const calls = [];
  const renderCalls = [];
  const sendCalls = [];

  const result = await processNotificationJobs(
    { batchSize: 4, leaseSeconds: 120 },
    notificationWorkerDependencies({
      claimNotifications: async (input) => {
        calls.push(["claim", input]);
        return [notificationJob];
      },
      loadCompletedDocument: async (documentId) => {
        calls.push(["load", documentId]);
        return completedDocument;
      },
      download: async (path) => {
        calls.push(["download", path]);
        return Buffer.from("%PDF-email");
      },
      render: async (document) => {
        renderCalls.push(document);
        return Buffer.from("%PDF-rendered-again");
      },
      sendEmail: async (input) => {
        calls.push(["send", input]);
        sendCalls.push(input);
        return { providerMessageId: "provider-message-1" };
      },
      completeNotification: async (input) => {
        calls.push(["complete", input]);
      },
    }),
  );

  assert.deepEqual(result, { claimed: 1, completed: 1, failed: 0 });
  assert.deepEqual(calls.map(([name]) => name), [
    "claim",
    "load",
    "download",
    "send",
    "complete",
  ]);
  assert.deepEqual(calls[0][1], { batchSize: 4, leaseSeconds: 120 });
  assert.equal(sendCalls[0].idempotencyKey, `document-notification/${notificationJob.id}`);
  assert.equal(sendCalls[0].attachment.filename, "fabtek-richiesta-000017.pdf");
  assert.equal(sendCalls[0].attachment.buffer.toString(), "%PDF-email");
  assert.deepEqual(sendCalls[0].recipients, notificationJob.recipients);
  assert.equal(renderCalls.length, 0);
  assert.deepEqual(calls[4][1], {
    jobId: NOTIFICATION_JOB_ID,
    attempts: 2,
    providerMessageId: "provider-message-1",
  });
});

test("retries a provider failure without changing or regenerating the completed document", async () => {
  const failures = [];
  const downloads = [];
  const documentWrites = [];

  const result = await processNotificationJobs({}, notificationWorkerDependencies({
    download: async (path) => {
      downloads.push(path);
      return Buffer.from("%PDF-email");
    },
    sendEmail: async () => {
      throw new DocumentEmailError();
    },
    failNotification: async (input) => failures.push(input),
    completeDocument: async (input) => documentWrites.push(input),
  }));

  assert.deepEqual(result, { claimed: 1, completed: 0, failed: 1 });
  assert.deepEqual(downloads, [completedDocument.storagePath]);
  assert.deepEqual(failures, [{
    jobId: NOTIFICATION_JOB_ID,
    attempts: 2,
    error: "DOCUMENT_EMAIL_SEND_FAILED",
    retryAt: "2026-08-28T10:05:00.000Z",
    terminal: false,
  }]);
  assert.equal(documentWrites.length, 0);
});

test("continues the notification batch after one email fails", async () => {
  const secondJob = {
    ...notificationJob,
    id: "40000000-0000-4000-8000-000000000002",
    documentId: "50000000-0000-4000-8000-000000000002",
  };
  const completions = [];
  const failures = [];

  const result = await processNotificationJobs({}, notificationWorkerDependencies({
    claimNotifications: async () => [notificationJob, secondJob],
    loadCompletedDocument: async (documentId) => ({
      ...completedDocument,
      id: documentId,
    }),
    sendEmail: async (input) => {
      if (input.idempotencyKey.endsWith(notificationJob.id)) {
        throw new DocumentEmailError();
      }
      return { providerMessageId: "provider-message-2" };
    },
    completeNotification: async (input) => completions.push(input),
    failNotification: async (input) => failures.push(input),
  }));

  assert.deepEqual(result, { claimed: 2, completed: 1, failed: 1 });
  assert.equal(failures[0].jobId, notificationJob.id);
  assert.equal(completions[0].jobId, secondJob.id);
  assert.equal(completions[0].attempts, secondJob.attempts);
});

test("claims notification rows with normalized recipients and bounded lease arguments", async () => {
  const calls = [];
  const jobs = await claimNotificationJobs(
    { batchSize: 4, leaseSeconds: 120 },
    {
      createClient: () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return {
            data: [{
              id: NOTIFICATION_JOB_ID,
              request_id: REQUEST_ID,
              document_id: DOCUMENT_ID,
              document_type: "initial_request",
              recipients: ["warehouse@example.com"],
              subject: notificationJob.subject,
              attempts: 2,
              lease_expires_at: "2026-08-28T10:05:00.000Z",
            }],
            error: null,
          };
        },
      }),
    },
  );

  assert.deepEqual(jobs, [notificationJob]);
  assert.deepEqual(calls, [{
    name: "claim_notification_jobs",
    args: { p_limit: 4, p_lease_seconds: 120 },
  }]);
});

test("loads only completed document metadata and downloads its private PDF", async () => {
  const queryCalls = [];
  const storageCalls = [];
  const query = {
    select(value) {
      queryCalls.push(["select", value]);
      return this;
    },
    eq(column, value) {
      queryCalls.push(["eq", column, value]);
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          id: DOCUMENT_ID,
          request_id: REQUEST_ID,
          document_type: "initial_request",
          storage_path: completedDocument.storagePath,
          request: { request_number: 17 },
        },
        error: null,
      };
    },
  };
  const createClient = () => ({
    from: (table) => {
      queryCalls.push(["from", table]);
      return query;
    },
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          storageCalls.push({ bucket, path });
          return { data: new Blob(["%PDF-private"]), error: null };
        },
      }),
    },
  });

  const metadata = await loadCompletedGeneratedDocument(DOCUMENT_ID, { createClient });
  const buffer = await downloadGeneratedPdf(completedDocument.storagePath, { createClient });

  assert.deepEqual(metadata, completedDocument);
  assert.deepEqual(queryCalls.slice(2), [
    ["eq", "id", DOCUMENT_ID],
    ["eq", "status", "completed"],
  ]);
  assert.deepEqual(storageCalls, [{
    bucket: "generated-documents",
    path: completedDocument.storagePath,
  }]);
  assert.equal(buffer.toString(), "%PDF-private");
});

test("passes the claimed attempt to notification complete and fail RPCs", async () => {
  const calls = [];
  const createClient = () => ({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  });

  await completeNotificationJob({
    jobId: NOTIFICATION_JOB_ID,
    attempts: 2,
    providerMessageId: "provider-message-1",
  }, { createClient });
  await failNotificationJob({
    jobId: NOTIFICATION_JOB_ID,
    attempts: 2,
    error: "DOCUMENT_EMAIL_SEND_FAILED",
    retryAt: "2026-08-28T10:05:00.000Z",
    terminal: false,
  }, { createClient });

  assert.deepEqual(calls, [{
    name: "complete_notification_job",
    args: {
      p_job_id: NOTIFICATION_JOB_ID,
      p_attempts: 2,
      p_provider_message_id: "provider-message-1",
    },
  }, {
    name: "fail_notification_job",
    args: {
      p_job_id: NOTIFICATION_JOB_ID,
      p_attempts: 2,
      p_error: "DOCUMENT_EMAIL_SEND_FAILED",
      p_retry_at: "2026-08-28T10:05:00.000Z",
      p_terminal: false,
    },
  }]);
});
