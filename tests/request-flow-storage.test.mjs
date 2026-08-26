import assert from "node:assert/strict";
import test from "node:test";

import * as requestFlowStorage from "../lib/domain/requests/flow-storage.ts";

const {
  parsePersistedRequestFlow,
  serializeRequestFlow,
} = requestFlowStorage;

const CLIENT_REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CLIENT_REQUEST_ID = "10000000-0000-4000-8000-000000000002";
const VARIANT_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_VARIANT_ID = "20000000-0000-4000-8000-000000000002";
const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";
const OWNER_A_ID = "40000000-0000-4000-8000-000000000001";
const OWNER_B_ID = "40000000-0000-4000-8000-000000000002";

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
  }, OWNER_A_ID);
  const restored = parsePersistedRequestFlow(snapshot, OWNER_A_ID);

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
  }, OWNER_A_ID);

  assert.deepEqual(parsePersistedRequestFlow(snapshot, OWNER_A_ID)?.attemptState, {
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
    version: 2,
    ownerId: OWNER_A_ID,
    draft: changedDraft,
    attempt: { phase: "failed", payload: attempt(), errorCode: "UNEXPECTED_ERROR" },
  });
  const restored = parsePersistedRequestFlow(snapshot, OWNER_A_ID);

  assert.ok(restored);
  assert.deepEqual(restored.draft, changedDraft);
  assert.equal(restored.attemptState.phase, "blocked");
  assert.equal(restored.attemptState.clientRequestId, CLIENT_REQUEST_ID);
});

test("a mismatched attempt UUID preserves the draft but blocks changed-payload reuse", () => {
  const snapshot = JSON.stringify({
    version: 2,
    ownerId: OWNER_A_ID,
    draft: draft(),
    attempt: {
      phase: "failed",
      payload: attempt({ clientRequestId: OTHER_CLIENT_REQUEST_ID }),
      errorCode: "UNEXPECTED_ERROR",
    },
  });
  const restored = parsePersistedRequestFlow(snapshot, OWNER_A_ID);

  assert.ok(restored);
  assert.deepEqual(restored.draft, draft());
  assert.equal(restored.attemptState.phase, "blocked");
});

test("a corrupt attempt preserves a valid draft in a blocked recovery state", () => {
  const snapshot = JSON.stringify({
    version: 2,
    ownerId: OWNER_A_ID,
    draft: draft(),
    attempt: {
      phase: "submitting",
      payload: { ...attempt(), lines: [{ quantity: "2" }] },
    },
  });
  const restored = parsePersistedRequestFlow(snapshot, OWNER_A_ID);

  assert.ok(restored);
  assert.deepEqual(restored.draft, draft());
  assert.equal(restored.attemptState.phase, "blocked");
});

test("unsupported or wholly corrupt envelopes are discarded", () => {
  assert.equal(parsePersistedRequestFlow("not-json", OWNER_A_ID), null);
  assert.equal(parsePersistedRequestFlow(JSON.stringify({
    version: 3,
    draft: draft(),
    attempt: null,
  }), OWNER_A_ID), null);
});

test("a persisted request flow is available only to its authenticated owner", () => {
  const snapshot = serializeRequestFlow(draft(), {
    phase: "failed",
    attempt: attempt(),
    errorCode: "UNEXPECTED_ERROR",
  }, OWNER_A_ID);

  assert.equal(JSON.parse(snapshot).ownerId, OWNER_A_ID);
  assert.ok(parsePersistedRequestFlow(snapshot, OWNER_A_ID));
  assert.equal(parsePersistedRequestFlow(snapshot, OWNER_B_ID), null);

  const ownerless = JSON.parse(snapshot);
  delete ownerless.ownerId;
  assert.equal(
    parsePersistedRequestFlow(JSON.stringify(ownerless), OWNER_A_ID),
    null,
  );
});

test("logout cleanup prevents user B from hydrating user A request state", () => {
  assert.equal(typeof requestFlowStorage.getRequestFlowStorageKey, "function");
  assert.equal(typeof requestFlowStorage.clearRequestFlowStorage, "function");

  const values = new Map();
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const ownerAKey = requestFlowStorage.getRequestFlowStorageKey(OWNER_A_ID);
  const ownerBKey = requestFlowStorage.getRequestFlowStorageKey(OWNER_B_ID);
  storage.setItem(
    ownerAKey,
    serializeRequestFlow(draft(), { phase: "submitting", attempt: attempt() }, OWNER_A_ID),
  );
  storage.setItem(ownerBKey, "stale-other-owner-flow");
  storage.setItem("unrelated", "keep");
  storage.setItem("fabtek:material-request-flow:v1", "legacy-ownerless");

  requestFlowStorage.clearRequestFlowStorage(storage);

  assert.equal(storage.getItem(ownerAKey), null);
  assert.equal(storage.getItem("fabtek:material-request-flow:v1"), null);
  assert.equal(storage.getItem("unrelated"), "keep");
  assert.equal(storage.getItem(ownerBKey), null);

  storage.setItem(
    ownerBKey,
    serializeRequestFlow(
      draft({ clientRequestId: OTHER_CLIENT_REQUEST_ID }),
      { phase: "idle" },
      OWNER_B_ID,
    ),
  );
  const restoredForB = parsePersistedRequestFlow(
    storage.getItem(ownerBKey),
    OWNER_B_ID,
  );
  assert.equal(restoredForB?.draft.clientRequestId, OTHER_CLIENT_REQUEST_ID);
});

test("blocked recovery preserves content, renews the key, and persists idle state", () => {
  assert.equal(typeof requestFlowStorage.recoverBlockedRequestFlow, "function");

  const blocked = {
    phase: "blocked",
    clientRequestId: CLIENT_REQUEST_ID,
    errorCode: "IDEMPOTENCY_PAYLOAD_MISMATCH",
    attempt: attempt(),
  };
  const recovered = requestFlowStorage.recoverBlockedRequestFlow(
    draft(),
    blocked,
    OTHER_CLIENT_REQUEST_ID,
  );
  assert.ok(recovered);
  assert.equal(recovered.attemptState.phase, "idle");
  assert.equal(recovered.draft.clientRequestId, OTHER_CLIENT_REQUEST_ID);
  assert.deepEqual(recovered.draft.header, draft().header);
  assert.deepEqual(recovered.draft.lines, draft().lines);

  const persisted = serializeRequestFlow(
    recovered.draft,
    recovered.attemptState,
    OWNER_A_ID,
  );
  assert.deepEqual(
    parsePersistedRequestFlow(persisted, OWNER_A_ID),
    recovered,
  );
  assert.equal(
    requestFlowStorage.recoverBlockedRequestFlow(
      draft(),
      { phase: "idle" },
      OTHER_CLIENT_REQUEST_ID,
    ),
    null,
  );
  assert.equal(
    requestFlowStorage.recoverBlockedRequestFlow(
      draft(),
      blocked,
      CLIENT_REQUEST_ID,
    ),
    null,
  );
});
