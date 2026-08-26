import type { ActionError } from "../errors";
import type { FulfillRequestInput } from "../requests/contracts";
import type { ValidationResult } from "../requests/validation";

const MAX_QUANTITY = 999_999;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FULFILLMENT_FIELDS = new Set(["requestLineId", "quantity", "idempotencyKey", "notes"]);

function invalid(): ValidationResult<never> {
  const error: ActionError = {
    code: "INVALID_FULFILLMENT",
    message: "Controlla i dati inseriti.",
  };
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function normalizeNotes(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length <= 500 ? normalized || null : undefined;
}

export function validateFulfillment(input: unknown): ValidationResult<FulfillRequestInput> {
  if (!isRecord(input) || Object.keys(input).some((key) => !FULFILLMENT_FIELDS.has(key))) {
    return invalid();
  }
  if (!isUuid(input.requestLineId) || !isUuid(input.idempotencyKey)) {
    return invalid();
  }
  const quantity = input.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return invalid();
  }

  const notes = normalizeNotes(input.notes);
  if (notes === undefined) {
    return invalid();
  }

  return {
    ok: true,
    data: {
      requestLineId: input.requestLineId,
      quantity,
      idempotencyKey: input.idempotencyKey,
      notes,
    },
  };
}
