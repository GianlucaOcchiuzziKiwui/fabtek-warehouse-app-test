import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { validateFulfillment } from "../lib/domain/fulfillment/validation.ts";
import {
  isRequiredTextWithinLimit,
  validateSubmitRequest,
} from "../lib/domain/requests/validation.ts";

const VARIANT_ID = "20000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";

function line(quantity = 2, itemVariantId = VARIANT_ID) {
  return { itemVariantId, categoryId: CATEGORY_ID, quantity };
}

function request(overrides = {}) {
  return {
    clientRequestId: "10000000-0000-4000-8000-000000000001",
    project: "P",
    toolLine: "T",
    utilities: "U",
    lines: [line()],
    ...overrides,
  };
}

test("accepts a valid untracked request payload", () => {
  const result = validateSubmitRequest({
    clientRequestId: "10000000-0000-4000-8000-000000000001",
    project: " P-44 ",
    toolLine: " TL-2 ",
    utilities: " Aria compressa ",
    notes: " ",
    lines: [{
      itemVariantId: VARIANT_ID,
      categoryId: CATEGORY_ID,
      quantity: 250,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.project, "P-44");
  assert.equal(result.data.notes, null);
});

test("rejects duplicate variants and invalid quantities", () => {
  const result = validateSubmitRequest(request({
    clientRequestId: crypto.randomUUID(),
    lines: [line(0), line(2)],
  }));

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_REQUEST_LINES");
});

test("rejects duplicate variants with otherwise valid lines", () => {
  const result = validateSubmitRequest(request({ lines: [line(1), line(2)] }));

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_REQUEST_LINES");
});

test("rejects an empty request", () => {
  const result = validateSubmitRequest(request({ lines: [] }));

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "EMPTY_REQUEST");
});

test("enforces SQL header limits after trimming", () => {
  const valid = validateSubmitRequest(request({
    project: ` ${"p".repeat(120)} `,
    toolLine: ` ${"t".repeat(120)} `,
    utilities: ` ${"u".repeat(240)} `,
  }));
  const invalid = validateSubmitRequest(request({ project: "p".repeat(121) }));

  assert.equal(valid.ok, true);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "INVALID_REQUEST_HEADER");
});

test("counts Unicode code points like PostgreSQL header limits", () => {
  const valid = validateSubmitRequest(request({ project: "\u{1F527}".repeat(120) }));
  const invalid = validateSubmitRequest(request({ project: "\u{1F527}".repeat(121) }));

  assert.equal(valid.ok, true);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "INVALID_REQUEST_HEADER");
});

test("client header checks use PostgreSQL code-point limits", () => {
  assert.equal(isRequiredTextWithinLimit("\u{1F527}".repeat(120), 120), true);
  assert.equal(isRequiredTextWithinLimit("\u{1F527}".repeat(121), 120), false);
});

test("normalizes request notes and rejects malformed identifiers", () => {
  const normalized = validateSubmitRequest(request({ notes: "  Consegna urgente  " }));
  const invalid = validateSubmitRequest(request({ clientRequestId: "not-a-uuid" }));

  assert.equal(normalized.ok, true);
  assert.equal(normalized.data.notes, "Consegna urgente");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "INVALID_REQUEST_HEADER");
});

test("accepts PostgreSQL UUIDs without an RFC variant in request fields", () => {
  const result = validateSubmitRequest(request({
    clientRequestId: "10000000-0000-0000-0000-000000000001",
    lines: [{
      itemVariantId: "20000000-0000-0000-0000-000000000001",
      categoryId: "30000000-0000-0000-0000-000000000001",
      quantity: 1,
    }],
  }));

  assert.equal(result.ok, true);
});

test("rejects decimal and excessive request quantities", () => {
  const decimal = validateSubmitRequest(request({ lines: [line(1.5)] }));
  const excessive = validateSubmitRequest(request({ lines: [line(1_000_000)] }));

  assert.equal(decimal.ok, false);
  assert.equal(decimal.error.code, "INVALID_REQUEST_LINES");
  assert.equal(excessive.ok, false);
  assert.equal(excessive.error.code, "INVALID_REQUEST_LINES");
});

test("validates and normalizes a fulfillment payload", () => {
  const result = validateFulfillment({
    requestLineId: "40000000-0000-4000-8000-000000000001",
    quantity: 3,
    idempotencyKey: "50000000-0000-4000-8000-000000000001",
    notes: "  Ritirato dal reparto  ",
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.notes, "Ritirato dal reparto");
});

test("counts Unicode code points for the application fulfillment note limit", () => {
  const valid = validateFulfillment({
    requestLineId: "40000000-0000-4000-8000-000000000001",
    quantity: 1,
    idempotencyKey: "50000000-0000-4000-8000-000000000001",
    notes: "\u{1F527}".repeat(500),
  });
  const invalid = validateFulfillment({
    requestLineId: "40000000-0000-4000-8000-000000000001",
    quantity: 1,
    idempotencyKey: "50000000-0000-4000-8000-000000000001",
    notes: "\u{1F527}".repeat(501),
  });

  assert.equal(valid.ok, true);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "INVALID_FULFILLMENT");
});

test("accepts PostgreSQL UUIDs without an RFC variant in fulfillment fields", () => {
  const result = validateFulfillment({
    requestLineId: "40000000-0000-0000-0000-000000000001",
    quantity: 3,
    idempotencyKey: "50000000-0000-0000-0000-000000000001",
    notes: null,
  });

  assert.equal(result.ok, true);
});

test("rejects fulfillment payloads outside the contract", () => {
  const invalidQuantity = validateFulfillment({
    requestLineId: "40000000-0000-4000-8000-000000000001",
    quantity: 1_000_000,
    idempotencyKey: "50000000-0000-4000-8000-000000000001",
    notes: "n".repeat(501),
  });
  const unexpectedField = validateFulfillment({
    requestLineId: "40000000-0000-4000-8000-000000000001",
    quantity: 1,
    idempotencyKey: "50000000-0000-4000-8000-000000000001",
    notes: null,
    requestId: "should-not-pass",
  });

  assert.equal(invalidQuantity.ok, false);
  assert.equal(invalidQuantity.error.code, "INVALID_FULFILLMENT");
  assert.equal(unexpectedField.ok, false);
  assert.equal(unexpectedField.error.code, "INVALID_FULFILLMENT");
});
