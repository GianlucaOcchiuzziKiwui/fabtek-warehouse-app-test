import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyDraft,
  parsePersistedRequestDraft,
  requestDraftReducer,
} from "../lib/domain/requests/draft.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function variantLine(overrides = {}) {
  return {
    itemVariantId: "aaaaaaa1-1111-4111-8111-111111111111",
    categoryId: "bbbbbbb2-2222-4222-8222-222222222222",
    quantity: 1,
    ...overrides,
  };
}

test("adding the same variant updates one cart line", () => {
  const first = requestDraftReducer(createEmptyDraft(), {
    type: "add-line",
    line: variantLine({ quantity: 2 }),
  });
  const second = requestDraftReducer(first, {
    type: "add-line",
    line: variantLine({ quantity: 3 }),
  });

  assert.equal(second.lines.length, 1);
  assert.equal(second.lines[0].quantity, 3);
});

test("setting a quantity updates only the matching cart line", () => {
  const initial = requestDraftReducer(createEmptyDraft(), {
    type: "add-line",
    line: variantLine({ quantity: 2 }),
  });
  const withSecondLine = requestDraftReducer(initial, {
    type: "add-line",
    line: variantLine({
      itemVariantId: "ccccccc3-3333-4333-8333-333333333333",
      quantity: 4,
    }),
  });

  const updated = requestDraftReducer(withSecondLine, {
    type: "set-quantity",
    itemVariantId: "aaaaaaa1-1111-4111-8111-111111111111",
    quantity: 7,
  });

  assert.deepEqual(updated.lines, [
    variantLine({ quantity: 7 }),
    variantLine({
      itemVariantId: "ccccccc3-3333-4333-8333-333333333333",
      quantity: 4,
    }),
  ]);
});

test("setting a non-positive quantity preserves the existing cart line", () => {
  const initial = requestDraftReducer(createEmptyDraft(), {
    type: "add-line",
    line: variantLine({ quantity: 2 }),
  });

  const updated = requestDraftReducer(initial, {
    type: "set-quantity",
    itemVariantId: "aaaaaaa1-1111-4111-8111-111111111111",
    quantity: 0,
  });

  assert.equal(updated.lines[0].quantity, 2);
});

test("removing a cart line leaves the other variants untouched", () => {
  const initial = requestDraftReducer(createEmptyDraft(), {
    type: "add-line",
    line: variantLine(),
  });
  const withSecondLine = requestDraftReducer(initial, {
    type: "add-line",
    line: variantLine({
      itemVariantId: "ccccccc3-3333-4333-8333-333333333333",
      quantity: 2,
    }),
  });

  const updated = requestDraftReducer(withSecondLine, {
    type: "remove-line",
    itemVariantId: "aaaaaaa1-1111-4111-8111-111111111111",
  });

  assert.deepEqual(updated.lines, [
    variantLine({
      itemVariantId: "ccccccc3-3333-4333-8333-333333333333",
      quantity: 2,
    }),
  ]);
});

test("resetting a draft starts a separate client request", () => {
  const initial = createEmptyDraft();
  const reset = requestDraftReducer(initial, { type: "reset" });

  assert.notEqual(reset.clientRequestId, initial.clientRequestId);
  assert.match(reset.clientRequestId, UUID_PATTERN);
  assert.deepEqual(reset.header, {
    project: "",
    toolLine: "",
    utilities: "",
    notes: "",
  });
  assert.deepEqual(reset.lines, []);
});

test("rejects persisted snapshots with an unsupported version or malformed lines", () => {
  const valid = createEmptyDraft();

  assert.equal(
    parsePersistedRequestDraft(JSON.stringify({ ...valid, version: 2 })),
    null,
  );
  assert.equal(
    parsePersistedRequestDraft(JSON.stringify({ ...valid, lines: [{ quantity: 1 }] })),
    null,
  );
});
