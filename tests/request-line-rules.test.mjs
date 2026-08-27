import assert from "node:assert/strict";
import test from "node:test";

import {
  canAddDraftLine,
  stepDraftQuantity,
} from "../lib/domain/requests/line-rules.ts";

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

test("quantity steps stay between zero and the variant maximum", () => {
  assert.equal(stepDraftQuantity("0", 1, 4), 1);
  assert.equal(stepDraftQuantity("3", -1, 4), 2);
  assert.equal(stepDraftQuantity("0", -1, 4), 0);
  assert.equal(stepDraftQuantity("4", 1, 4), 4);
});

test("quantity steps recover from an empty manual value", () => {
  assert.equal(stepDraftQuantity("", 1, 999_999), 1);
});
