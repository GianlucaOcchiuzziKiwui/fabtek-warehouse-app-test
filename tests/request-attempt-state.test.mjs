import assert from "node:assert/strict";
import test from "node:test";

import {
  completeRequestAttempt,
  failRequestAttempt,
  getRequestRetryStatus,
  IDLE_REQUEST_ATTEMPT,
  startRequestAttempt,
} from "../lib/domain/requests/attempt-state.ts";

const CLIENT_REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CLIENT_REQUEST_ID = "10000000-0000-4000-8000-000000000002";
const VARIANT_ID = "20000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";

function draft(overrides = {}) {
  return {
    clientRequestId: CLIENT_REQUEST_ID,
    project: " Progetto 21 ",
    toolLine: " Linea A ",
    utilities: " Aria compressa ",
    notes: " Consegna urgente ",
    lines: [{
      itemVariantId: VARIANT_ID,
      categoryId: CATEGORY_ID,
      quantity: 2,
    }],
    ...overrides,
  };
}

test("a failed request retries the immutable normalized first payload after edits", () => {
  const started = startRequestAttempt(IDLE_REQUEST_ATTEMPT, draft());
  assert.deepEqual(started.attempt, {
    clientRequestId: CLIENT_REQUEST_ID,
    project: "Progetto 21",
    toolLine: "Linea A",
    utilities: "Aria compressa",
    notes: "Consegna urgente",
    lines: [{
      itemVariantId: VARIANT_ID,
      categoryId: CATEGORY_ID,
      quantity: 2,
    }],
  });

  const failed = failRequestAttempt(started.state, "UNEXPECTED_ERROR");
  const retry = startRequestAttempt(failed, draft({
    project: "Progetto modificato",
    lines: [{
      itemVariantId: VARIANT_ID,
      categoryId: CATEGORY_ID,
      quantity: 9,
    }],
  }));

  assert.deepEqual(retry.attempt, started.attempt);
  assert.equal(getRequestRetryStatus(failed, CLIENT_REQUEST_ID), "retryable");
});

test("only a coherent success resets the request attempt", () => {
  const started = startRequestAttempt(IDLE_REQUEST_ATTEMPT, draft());

  assert.deepEqual(
    completeRequestAttempt(started.state, OTHER_CLIENT_REQUEST_ID),
    started.state,
  );
  assert.deepEqual(
    completeRequestAttempt(started.state, CLIENT_REQUEST_ID),
    IDLE_REQUEST_ATTEMPT,
  );
});

test("a pending request rejects a concurrent start", () => {
  const started = startRequestAttempt(IDLE_REQUEST_ATTEMPT, draft());
  const duplicate = startRequestAttempt(started.state, draft({ project: "Altro" }));

  assert.equal(duplicate.attempt, null);
  assert.deepEqual(duplicate.state, started.state);
});

test("a retry cannot cross the client request context", () => {
  const started = startRequestAttempt(IDLE_REQUEST_ATTEMPT, draft());
  const failed = failRequestAttempt(started.state, "UNEXPECTED_ERROR");
  const blocked = startRequestAttempt(
    failed,
    draft({ clientRequestId: OTHER_CLIENT_REQUEST_ID }),
  );

  assert.equal(blocked.attempt, null);
  assert.equal(getRequestRetryStatus(failed, OTHER_CLIENT_REQUEST_ID), "context_changed");
});

test("invalid drafts cannot create an attempt", () => {
  const started = startRequestAttempt(IDLE_REQUEST_ATTEMPT, draft({ lines: [] }));

  assert.equal(started.attempt, null);
  assert.deepEqual(started.state, IDLE_REQUEST_ATTEMPT);
});
