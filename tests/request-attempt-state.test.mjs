import assert from "node:assert/strict";
import test from "node:test";

import {
  completeRequestAttempt,
  failRequestAttempt,
  getRequestRetryStatus,
  IDLE_REQUEST_ATTEMPT,
  resolveRequestAttemptError,
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

test("definitive action errors unlock the unchanged draft for correction", () => {
  const started = startRequestAttempt(IDLE_REQUEST_ATTEMPT, draft());

  for (const errorCode of [
    "INSUFFICIENT_STOCK",
    "INVALID_INPUT",
    "INVALID_REQUEST_LINES",
    "FORBIDDEN",
  ]) {
    assert.deepEqual(
      resolveRequestAttemptError(started.state, errorCode),
      IDLE_REQUEST_ATTEMPT,
    );
  }

  const corrected = startRequestAttempt(
    resolveRequestAttemptError(started.state, "INSUFFICIENT_STOCK"),
    draft({
      lines: [{
        itemVariantId: VARIANT_ID,
        categoryId: CATEGORY_ID,
        quantity: 1,
      }],
    }),
  );
  assert.equal(corrected.attempt?.clientRequestId, CLIENT_REQUEST_ID);
  assert.equal(corrected.attempt?.lines[0]?.quantity, 1);
});

test("only ambiguous action results retain a retryable immutable attempt", () => {
  const started = startRequestAttempt(IDLE_REQUEST_ATTEMPT, draft());
  const failed = resolveRequestAttemptError(started.state, "UNEXPECTED_ERROR");

  assert.equal(failed.phase, "failed");
  assert.deepEqual(failed.attempt, started.attempt);
  assert.equal(getRequestRetryStatus(failed, CLIENT_REQUEST_ID), "retryable");
});

test("an idempotency payload mismatch blocks reuse and preserves recovery context", () => {
  const started = startRequestAttempt(IDLE_REQUEST_ATTEMPT, draft());
  const blocked = resolveRequestAttemptError(
    started.state,
    "IDEMPOTENCY_PAYLOAD_MISMATCH",
  );

  assert.equal(blocked.phase, "blocked");
  assert.equal(blocked.clientRequestId, CLIENT_REQUEST_ID);
  assert.deepEqual(blocked.attempt, started.attempt);
  assert.equal(getRequestRetryStatus(blocked, CLIENT_REQUEST_ID), "blocked");
  assert.equal(startRequestAttempt(blocked, draft()).attempt, null);
});
