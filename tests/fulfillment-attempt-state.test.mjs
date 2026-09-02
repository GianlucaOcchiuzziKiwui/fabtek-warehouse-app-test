import assert from "node:assert/strict";
import test from "node:test";

import {
  completeFulfillmentAttempt,
  failFulfillmentAttempt,
  getFulfillmentRetryStatus,
  IDLE_FULFILLMENT_ATTEMPT,
  matchesFulfillmentAttemptResult,
  resolveFulfillmentQuantity,
  startFulfillmentAttempt,
} from "../lib/domain/fulfillment/attempt-state.ts";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_LINE_ID = "20000000-0000-4000-8000-000000000001";
const FIRST_KEY = "30000000-0000-4000-8000-000000000001";
const SECOND_KEY = "30000000-0000-4000-8000-000000000002";

test("the full-line intent always uses the current remaining quantity", () => {
  assert.equal(resolveFulfillmentQuantity("2", "all", 7), 7);
  assert.equal(resolveFulfillmentQuantity("2", null, 7), 2);
});

function draft(overrides = {}) {
  return {
    requestId: REQUEST_ID,
    requestLineId: REQUEST_LINE_ID,
    quantity: 4,
    notes: "Prima consegna",
    ...overrides,
  };
}

test("a rejected attempt retries the immutable first payload after edits", () => {
  const started = startFulfillmentAttempt(
    IDLE_FULFILLMENT_ATTEMPT,
    draft(),
    () => FIRST_KEY,
    10,
  );
  assert.deepEqual(started.attempt, {
    ...draft(),
    idempotencyKey: FIRST_KEY,
  });

  const failed = failFulfillmentAttempt(started.state, "UNEXPECTED_ERROR", 10);
  assert.equal(failed.refresh, false);
  assert.equal(
    getFulfillmentRetryStatus(failed.state, REQUEST_ID, REQUEST_LINE_ID, 10),
    "retryable",
  );

  const retry = startFulfillmentAttempt(
    failed.state,
    draft({ quantity: 2, notes: "Dati modificati dopo l'errore" }),
    () => SECOND_KEY,
    10,
  );
  assert.deepEqual(retry.attempt, {
    ...draft(),
    idempotencyKey: FIRST_KEY,
  });
});

test("only success resets the attempt and permits a new key and payload", () => {
  const first = startFulfillmentAttempt(
    IDLE_FULFILLMENT_ATTEMPT,
    draft(),
    () => FIRST_KEY,
    10,
  );
  const reset = completeFulfillmentAttempt(first.state);
  assert.deepEqual(reset, IDLE_FULFILLMENT_ATTEMPT);

  const second = startFulfillmentAttempt(
    reset,
    draft({ quantity: 2, notes: "Nuovo tentativo" }),
    () => SECOND_KEY,
    6,
  );
  assert.equal(second.attempt.idempotencyKey, SECOND_KEY);
  assert.equal(second.attempt.quantity, 2);
  assert.equal(second.attempt.notes, "Nuovo tentativo");
});

test("a remaining conflict requests refresh and blocks a stale original payload", () => {
  const started = startFulfillmentAttempt(
    IDLE_FULFILLMENT_ATTEMPT,
    draft(),
    () => FIRST_KEY,
    10,
  );
  const failed = failFulfillmentAttempt(
    started.state,
    "FULFILLMENT_EXCEEDS_REMAINING",
    10,
  );

  assert.equal(failed.refresh, true);
  assert.equal(
    getFulfillmentRetryStatus(failed.state, REQUEST_ID, REQUEST_LINE_ID, 10),
    "refreshing_conflict",
  );
  assert.equal(
    getFulfillmentRetryStatus(failed.state, REQUEST_ID, REQUEST_LINE_ID, 3),
    "stale_conflict",
  );

  const blocked = startFulfillmentAttempt(
    failed.state,
    draft({ quantity: 3 }),
    () => SECOND_KEY,
    3,
  );
  assert.equal(blocked.attempt, null);
  assert.equal(blocked.state, failed.state);
});

test("a refreshed conflict can retry only when the original payload still fits", () => {
  const started = startFulfillmentAttempt(
    IDLE_FULFILLMENT_ATTEMPT,
    draft(),
    () => FIRST_KEY,
    10,
  );
  const failed = failFulfillmentAttempt(
    started.state,
    "FULFILLMENT_EXCEEDS_REMAINING",
    10,
  );

  assert.equal(
    getFulfillmentRetryStatus(failed.state, REQUEST_ID, REQUEST_LINE_ID, 6),
    "retryable",
  );
  const retry = startFulfillmentAttempt(
    failed.state,
    draft({ quantity: 1 }),
    () => SECOND_KEY,
    6,
  );
  assert.equal(retry.attempt.quantity, 4);
  assert.equal(retry.attempt.idempotencyKey, FIRST_KEY);
});

test("the synchronous lifecycle lock rejects a concurrent start", () => {
  let generatedKeys = 0;
  const started = startFulfillmentAttempt(
    IDLE_FULFILLMENT_ATTEMPT,
    draft(),
    () => {
      generatedKeys += 1;
      return FIRST_KEY;
    },
    10,
  );
  const duplicate = startFulfillmentAttempt(
    started.state,
    draft({ quantity: 2 }),
    () => {
      generatedKeys += 1;
      return SECOND_KEY;
    },
    10,
  );

  assert.equal(duplicate.attempt, null);
  assert.equal(duplicate.state, started.state);
  assert.equal(generatedKeys, 1);
});

test("a pending retry cannot cross request or line context", () => {
  const started = startFulfillmentAttempt(
    IDLE_FULFILLMENT_ATTEMPT,
    draft(),
    () => FIRST_KEY,
    10,
  );
  const failed = failFulfillmentAttempt(started.state, "UNEXPECTED_ERROR", 10);

  assert.equal(
    getFulfillmentRetryStatus(
      failed.state,
      "10000000-0000-4000-8000-000000000099",
      REQUEST_LINE_ID,
      10,
    ),
    "context_changed",
  );
});

test("a success response must belong to the immutable request and line", () => {
  const started = startFulfillmentAttempt(
    IDLE_FULFILLMENT_ATTEMPT,
    draft(),
    () => FIRST_KEY,
    10,
  );

  assert.equal(matchesFulfillmentAttemptResult(started.attempt, {
    requestId: REQUEST_ID,
    requestLineId: REQUEST_LINE_ID,
  }), true);
  assert.equal(matchesFulfillmentAttemptResult(started.attempt, {
    requestId: "10000000-0000-4000-8000-000000000099",
    requestLineId: REQUEST_LINE_ID,
  }), false);
  assert.equal(matchesFulfillmentAttemptResult(started.attempt, {
    requestId: REQUEST_ID,
    requestLineId: "20000000-0000-4000-8000-000000000099",
  }), false);
});
