import type { ActionError } from "../errors";
import type { SubmitRequestInput, SubmitRequestLineInput } from "./contracts";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

const MAX_QUANTITY = 999_999;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(code: string): ValidationResult<never> {
  return { ok: false, error: { code, message: "Controlla i dati inseriti." } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function normalizeRequiredText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= limit ? normalized : null;
}

export function normalizeOptionalNotes(value: unknown, limit?: number): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (limit !== undefined && normalized.length > limit) {
    return undefined;
  }
  return normalized || null;
}

function validateLine(value: unknown): SubmitRequestLineInput | null {
  if (!isRecord(value) || !isUuid(value.itemVariantId) || !isUuid(value.categoryId)) {
    return null;
  }
  const quantity = value.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return null;
  }

  return {
    itemVariantId: value.itemVariantId,
    categoryId: value.categoryId,
    quantity,
  };
}

export function validateSubmitRequest(input: unknown): ValidationResult<SubmitRequestInput> {
  if (!isRecord(input) || !isUuid(input.clientRequestId)) {
    return invalid("INVALID_REQUEST_HEADER");
  }

  const project = normalizeRequiredText(input.project, 120);
  const toolLine = normalizeRequiredText(input.toolLine, 120);
  const utilities = normalizeRequiredText(input.utilities, 240);
  const notes = normalizeOptionalNotes(input.notes);
  if (!project || !toolLine || !utilities || notes === undefined) {
    return invalid("INVALID_REQUEST_HEADER");
  }

  if (!Array.isArray(input.lines)) {
    return invalid("INVALID_REQUEST_LINES");
  }
  if (input.lines.length === 0) {
    return invalid("EMPTY_REQUEST");
  }

  const lines: SubmitRequestLineInput[] = [];
  const variantIds = new Set<string>();
  for (const line of input.lines) {
    const validatedLine = validateLine(line);
    if (!validatedLine || variantIds.has(validatedLine.itemVariantId)) {
      return invalid("INVALID_REQUEST_LINES");
    }
    variantIds.add(validatedLine.itemVariantId);
    lines.push(validatedLine);
  }

  return {
    ok: true,
    data: {
      clientRequestId: input.clientRequestId,
      project,
      toolLine,
      utilities,
      notes,
      lines,
    },
  };
}
