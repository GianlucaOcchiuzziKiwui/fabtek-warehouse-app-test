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

test("draft document route is authenticated, server-rendered, and non-cacheable", async () => {
  const source = await readFile("app/api/documents/draft/route.ts", "utf8");

  assert.doesNotMatch(source, /export const runtime/u);
  assert.match(source, /getCurrentProfile/u);
  assert.match(source, /can\(profile, "requests:create"\)/u);
  assert.match(source, /Content-Disposition/u);
  assert.match(source, /Cache-Control/u);
  assert.doesNotMatch(source, /window\.print/u);
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
