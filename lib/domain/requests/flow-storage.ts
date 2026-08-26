import {
  blockRequestAttempt,
  IDLE_REQUEST_ATTEMPT,
  type RequestAttemptState,
} from "./attempt-state.ts";
import {
  parsePersistedRequestDraft,
  type RequestDraft,
} from "./draft.ts";
import type { SubmitRequestInput } from "./contracts.ts";
import { validateSubmitRequest } from "./validation.ts";

const FLOW_VERSION = 1;
const ATTEMPT_FIELDS = new Set([
  "clientRequestId",
  "project",
  "toolLine",
  "utilities",
  "notes",
  "lines",
]);
const LINE_FIELDS = new Set(["itemVariantId", "categoryId", "quantity"]);

export type RestoredRequestFlow = {
  draft: RequestDraft;
  attemptState: RequestAttemptState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, fields: Set<string>) {
  return Object.keys(value).every((key) => fields.has(key))
    && Object.keys(value).length === fields.size;
}

function samePayload(left: SubmitRequestInput, right: SubmitRequestInput) {
  return left.clientRequestId === right.clientRequestId
    && left.project === right.project
    && left.toolLine === right.toolLine
    && left.utilities === right.utilities
    && left.notes === right.notes
    && left.lines.length === right.lines.length
    && left.lines.every((line, index) => {
      const other = right.lines[index];
      return other !== undefined
        && line.itemVariantId === other.itemVariantId
        && line.categoryId === other.categoryId
        && line.quantity === other.quantity;
    });
}

function parseNormalizedAttempt(value: unknown): SubmitRequestInput | null {
  if (!isRecord(value) || !hasOnlyFields(value, ATTEMPT_FIELDS)) return null;
  if (
    !Array.isArray(value.lines)
    || value.lines.some((line) => !isRecord(line) || !hasOnlyFields(line, LINE_FIELDS))
  ) {
    return null;
  }

  const validated = validateSubmitRequest(value);
  return validated.ok && samePayload(validated.data, value as SubmitRequestInput)
    ? validated.data
    : null;
}

function normalizedDraftPayload(draft: RequestDraft) {
  const validated = validateSubmitRequest({
    clientRequestId: draft.clientRequestId,
    project: draft.header.project,
    toolLine: draft.header.toolLine,
    utilities: draft.header.utilities,
    notes: draft.header.notes,
    lines: draft.lines,
  });
  return validated.ok ? validated.data : null;
}

function blockedFlow(
  draft: RequestDraft,
  errorCode: string,
  attempt?: SubmitRequestInput,
): RestoredRequestFlow {
  return {
    draft,
    attemptState: blockRequestAttempt(
      draft.clientRequestId,
      errorCode,
      attempt,
    ),
  };
}

export function serializeRequestFlow(
  draft: RequestDraft,
  attemptState: RequestAttemptState,
) {
  const attempt = attemptState.phase === "idle"
    ? null
    : attemptState.phase === "blocked"
      ? {
          phase: "blocked",
          clientRequestId: attemptState.clientRequestId,
          errorCode: attemptState.errorCode,
          payload: attemptState.attempt ?? null,
        }
      : {
          phase: attemptState.phase,
          payload: attemptState.attempt,
          errorCode: attemptState.phase === "failed"
            ? attemptState.errorCode
            : undefined,
        };

  return JSON.stringify({ version: FLOW_VERSION, draft, attempt });
}

export function parsePersistedRequestFlow(
  snapshot: string | null,
): RestoredRequestFlow | null {
  if (!snapshot) return null;

  try {
    const value: unknown = JSON.parse(snapshot);
    if (!isRecord(value) || value.version !== FLOW_VERSION) return null;

    const draft = parsePersistedRequestDraft(JSON.stringify(value.draft));
    if (!draft) return null;
    if (value.attempt === null) {
      return { draft, attemptState: IDLE_REQUEST_ATTEMPT };
    }
    if (!isRecord(value.attempt)) {
      return blockedFlow(draft, "CORRUPT_PERSISTED_ATTEMPT");
    }

    if (value.attempt.phase === "blocked") {
      const attempt = value.attempt.payload === null
        ? undefined
        : parseNormalizedAttempt(value.attempt.payload) ?? undefined;
      return blockedFlow(
        draft,
        typeof value.attempt.errorCode === "string"
          ? value.attempt.errorCode
          : "CORRUPT_PERSISTED_ATTEMPT",
        attempt,
      );
    }

    if (value.attempt.phase !== "submitting" && value.attempt.phase !== "failed") {
      return blockedFlow(draft, "CORRUPT_PERSISTED_ATTEMPT");
    }
    const attempt = parseNormalizedAttempt(value.attempt.payload);
    const draftPayload = normalizedDraftPayload(draft);
    if (
      !attempt
      || !draftPayload
      || attempt.clientRequestId !== draft.clientRequestId
      || !samePayload(attempt, draftPayload)
    ) {
      return blockedFlow(draft, "CORRUPT_PERSISTED_ATTEMPT", attempt ?? undefined);
    }

    return {
      draft,
      attemptState: {
        phase: "failed",
        attempt,
        errorCode: "UNEXPECTED_ERROR",
      },
    };
  } catch {
    return null;
  }
}
