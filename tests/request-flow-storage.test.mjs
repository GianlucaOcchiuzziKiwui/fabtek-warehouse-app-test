import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePersistedRequestFlow,
  serializeRequestFlow,
} from "../lib/domain/requests/flow-storage.ts";

const CLIENT_REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CLIENT_REQUEST_ID = "10000000-0000-4000-8000-000000000002";
const VARIANT_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_VARIANT_ID = "20000000-0000-4000-8000-000000000002";
const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";

function draft(overrides = {}) {
  return {
    version: 1,
    clientRequestId: CLIENT_REQUEST_ID,
    header: {
      project: " Progetto 21 ",
      toolLine: " Linea A ",
      utilities: " Aria compressa ",
      notes: " Consegna urgente ",
    },
    lines: [{
      itemVariantId: VARIANT_ID,
      categoryId: CATEGORY_ID,
      quantity: 2,
    }],
    ...overrides,
  };
}

function attempt(overrides = {}) {
  return {
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
    ...overrides,
  };
}

test("a persisted submitting attempt reloads as retryable with the immutable payload", () => {
  const snapshot = serializeRequestFlow(draft(), {
    phase: "submitting",
    attempt: attempt(),
  });
  const restored = parsePersistedRequestFlow(snapshot);

  assert.ok(restored);
  assert.deepEqual(restored.draft, draft());
  assert.deepEqual(restored.attemptState, {
    phase: "failed",
    attempt: attempt(),
    errorCode: "UNEXPECTED_ERROR",
  });
});

test("a persisted failed attempt remains retryable across reload", () => {
  const snapshot = serializeRequestFlow(draft(), {
    phase: "failed",
    attempt: attempt(),
    errorCode: "UNEXPECTED_ERROR",
  });

  assert.deepEqual(parsePersistedRequestFlow(snapshot)?.attemptState, {
    phase: "failed",
    attempt: attempt(),
    errorCode: "UNEXPECTED_ERROR",
  });
});

test("a changed draft with the same UUID is restored blocked, never retryable", () => {
  const changedDraft = draft({
    lines: [
      {
        itemVariantId: SECOND_VARIANT_ID,
        categoryId: CATEGORY_ID,
        quantity: 1,
      },
      ...draft().lines,
    ],
  });
  const snapshot = JSON.stringify({
    version: 1,
    draft: changedDraft,
    attempt: { phase: "failed", payload: attempt(), errorCode: "UNEXPECTED_ERROR" },
  });
  const restored = parsePersistedRequestFlow(snapshot);

  assert.ok(restored);
  assert.deepEqual(restored.draft, changedDraft);
  assert.equal(restored.attemptState.phase, "blocked");
  assert.equal(restored.attemptState.clientRequestId, CLIENT_REQUEST_ID);
});

test("a mismatched attempt UUID preserves the draft but blocks changed-payload reuse", () => {
  const snapshot = JSON.stringify({
    version: 1,
    draft: draft(),
    attempt: {
      phase: "failed",
      payload: attempt({ clientRequestId: OTHER_CLIENT_REQUEST_ID }),
      errorCode: "UNEXPECTED_ERROR",
    },
  });
  const restored = parsePersistedRequestFlow(snapshot);

  assert.ok(restored);
  assert.deepEqual(restored.draft, draft());
  assert.equal(restored.attemptState.phase, "blocked");
});

test("a corrupt attempt preserves a valid draft in a blocked recovery state", () => {
  const snapshot = JSON.stringify({
    version: 1,
    draft: draft(),
    attempt: {
      phase: "submitting",
      payload: { ...attempt(), lines: [{ quantity: "2" }] },
    },
  });
  const restored = parsePersistedRequestFlow(snapshot);

  assert.ok(restored);
  assert.deepEqual(restored.draft, draft());
  assert.equal(restored.attemptState.phase, "blocked");
});

test("unsupported or wholly corrupt envelopes are discarded", () => {
  assert.equal(parsePersistedRequestFlow("not-json"), null);
  assert.equal(parsePersistedRequestFlow(JSON.stringify({
    version: 2,
    draft: draft(),
    attempt: null,
  })), null);
});
