import assert from "node:assert/strict";
import test from "node:test";

import { canAddDraftLine } from "../lib/domain/requests/line-rules.ts";

function untrackedVariant() {
  return {
    stock: {
      trackInventory: false,
      availableQuantity: null,
    },
  };
}

function trackedVariant(availableQuantity) {
  return {
    stock: {
      trackInventory: true,
      availableQuantity,
    },
  };
}

test("untracked variants accept any bounded positive integer", () => {
  assert.deepEqual(canAddDraftLine(untrackedVariant(), 250), { ok: true });
});

test("tracked variants cannot exceed observed availability", () => {
  assert.equal(
    canAddDraftLine(trackedVariant(4), 5).error.code,
    "INSUFFICIENT_STOCK",
  );
});

test("tracked variants require an observed availability", () => {
  assert.equal(
    canAddDraftLine(trackedVariant(null), 1).error.code,
    "AVAILABILITY_UNKNOWN",
  );
});

test("zero, decimals and values above 999999 are rejected", () => {
  for (const quantity of [0, 1.5, 1_000_000]) {
    assert.equal(canAddDraftLine(untrackedVariant(), quantity).ok, false);
  }
});
