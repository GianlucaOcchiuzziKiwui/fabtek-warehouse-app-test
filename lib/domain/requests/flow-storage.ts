import {
  blockRequestAttempt,
  IDLE_REQUEST_ATTEMPT,
  type RequestAttemptState,
} from "./attempt-state.ts";
import {
  parsePersistedRequestDraft,
  requestDraftReducer,
  type RequestDraft,
} from "./draft.ts";
import type { SubmitRequestInput } from "./contracts.ts";
import { validateSubmitRequest } from "./validation.ts";

const FLOW_VERSION = 2;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_FLOW_STORAGE_PREFIX = "fabtek:material-request-flow:v2:";
const LEGACY_REQUEST_FLOW_STORAGE_PREFIX = "fabtek:material-request-flow:";
const LEGACY_REQUEST_DRAFT_STORAGE_KEY = "fabtek:material-request-draft:v1";
const FLOW_FIELDS = new Set(["version", "ownerId", "draft", "attempt"]);
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

type RequestFlowStorage = {
  readonly length: number;
  key: (index: number) => string | null;
  removeItem: (key: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, fields: Set<string>) {
  return Object.keys(value).every((key) => fields.has(key))
    && Object.keys(value).length === fields.size;
}

function normalizeOwnerId(ownerId: unknown) {
  return typeof ownerId === "string" && UUID_PATTERN.test(ownerId)
    ? ownerId.toLowerCase()
    : null;
}

export function getRequestFlowStorageKey(ownerId: string) {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  if (!normalizedOwnerId) throw new Error("Invalid request-flow owner.");
  return `${REQUEST_FLOW_STORAGE_PREFIX}${normalizedOwnerId}`;
}

export function clearRequestFlowStorage(storage: RequestFlowStorage) {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (
        key?.startsWith(LEGACY_REQUEST_FLOW_STORAGE_PREFIX)
        || key === LEGACY_REQUEST_DRAFT_STORAGE_KEY
      ) {
        keys.push(key);
      }
    }
  } catch {
    return;
  }

  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // Continue clearing the remaining scoped keys on best effort.
    }
  }
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
  ownerId: string,
) {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  if (!normalizedOwnerId) throw new Error("Invalid request-flow owner.");
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

  return JSON.stringify({
    version: FLOW_VERSION,
    ownerId: normalizedOwnerId,
    draft,
    attempt,
  });
}

export function parsePersistedRequestFlow(
  snapshot: string | null,
  ownerId: string,
): RestoredRequestFlow | null {
  if (!snapshot) return null;

  try {
    const value: unknown = JSON.parse(snapshot);
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    if (
      !normalizedOwnerId
      || !isRecord(value)
      || !hasOnlyFields(value, FLOW_FIELDS)
      || value.version !== FLOW_VERSION
      || normalizeOwnerId(value.ownerId) !== normalizedOwnerId
    ) {
      return null;
    }

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

export function recoverBlockedRequestFlow(
  draft: RequestDraft,
  attemptState: RequestAttemptState,
  clientRequestId: string,
): RestoredRequestFlow | null {
  if (
    attemptState.phase !== "blocked"
    || clientRequestId === draft.clientRequestId
  ) {
    return null;
  }

  const recoveredDraft = requestDraftReducer(draft, {
    type: "renew-client-request-id",
    clientRequestId,
  });
  if (recoveredDraft === draft) return null;

  return {
    draft: recoveredDraft,
    attemptState: IDLE_REQUEST_ATTEMPT,
  };
}
