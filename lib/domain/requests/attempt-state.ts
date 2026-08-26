import type { SubmitRequestInput } from "./contracts.ts";
import { validateSubmitRequest } from "./validation.ts";

export type RequestAttemptState =
  | { phase: "idle" }
  | { phase: "submitting"; attempt: SubmitRequestInput }
  | { phase: "failed"; attempt: SubmitRequestInput; errorCode: string };

export type RequestRetryStatus =
  | "idle"
  | "submitting"
  | "retryable"
  | "context_changed";

export const IDLE_REQUEST_ATTEMPT: RequestAttemptState = { phase: "idle" };

export function getRequestRetryStatus(
  state: RequestAttemptState,
  clientRequestId: string,
): RequestRetryStatus {
  if (state.phase === "idle") return "idle";
  if (state.phase === "submitting") return "submitting";
  return state.attempt.clientRequestId === clientRequestId
    ? "retryable"
    : "context_changed";
}

export function startRequestAttempt(
  state: RequestAttemptState,
  draft: unknown,
): { state: RequestAttemptState; attempt: SubmitRequestInput | null } {
  if (state.phase === "submitting") return { state, attempt: null };

  if (state.phase === "failed") {
    if (getRequestRetryStatus(state, readClientRequestId(draft)) !== "retryable") {
      return { state, attempt: null };
    }
    return {
      state: { phase: "submitting", attempt: state.attempt },
      attempt: state.attempt,
    };
  }

  const validated = validateSubmitRequest(draft);
  if (!validated.ok) return { state, attempt: null };

  const attempt: SubmitRequestInput = {
    ...validated.data,
    lines: validated.data.lines.map((line) => ({ ...line })),
  };
  return {
    state: { phase: "submitting", attempt },
    attempt,
  };
}

export function failRequestAttempt(
  state: RequestAttemptState,
  errorCode: string,
): RequestAttemptState {
  return state.phase === "submitting"
    ? { phase: "failed", attempt: state.attempt, errorCode }
    : state;
}

export function completeRequestAttempt(
  state: RequestAttemptState,
  clientRequestId: string,
): RequestAttemptState {
  return state.phase === "submitting"
    && state.attempt.clientRequestId === clientRequestId
    ? IDLE_REQUEST_ATTEMPT
    : state;
}

function readClientRequestId(value: unknown) {
  if (typeof value !== "object" || value === null || !("clientRequestId" in value)) {
    return "";
  }
  return typeof value.clientRequestId === "string" ? value.clientRequestId : "";
}
