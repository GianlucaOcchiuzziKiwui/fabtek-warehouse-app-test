export type FulfillmentAttemptDraft = {
  requestId: string;
  requestLineId: string;
  quantity: number;
  notes: string;
};

export type FulfillmentAttempt = FulfillmentAttemptDraft & {
  idempotencyKey: string;
};

export type FulfillmentAttemptState =
  | { phase: "idle" }
  | { phase: "submitting"; attempt: FulfillmentAttempt }
  | {
      phase: "failed";
      attempt: FulfillmentAttempt;
      errorCode: string;
      remainingAtFailure: number;
    };

export type FulfillmentRetryStatus =
  | "idle"
  | "submitting"
  | "retryable"
  | "refreshing_conflict"
  | "stale_conflict"
  | "context_changed";

export const IDLE_FULFILLMENT_ATTEMPT: FulfillmentAttemptState = {
  phase: "idle",
};

export function matchesFulfillmentAttemptResult(
  attempt: FulfillmentAttempt,
  result: { requestId: string; requestLineId: string },
) {
  return attempt.requestId === result.requestId
    && attempt.requestLineId === result.requestLineId;
}

function validQuantity(quantity: number, remainingQuantity: number) {
  return Number.isSafeInteger(quantity)
    && quantity >= 1
    && quantity <= remainingQuantity;
}

export function getFulfillmentRetryStatus(
  state: FulfillmentAttemptState,
  requestId: string,
  requestLineId: string,
  remainingQuantity: number,
): FulfillmentRetryStatus {
  if (state.phase === "idle") return "idle";
  if (state.phase === "submitting") return "submitting";
  if (
    state.attempt.requestId !== requestId
    || state.attempt.requestLineId !== requestLineId
  ) {
    return "context_changed";
  }

  if (state.errorCode !== "FULFILLMENT_EXCEEDS_REMAINING") {
    return "retryable";
  }
  if (remainingQuantity === state.remainingAtFailure) {
    return "refreshing_conflict";
  }
  return state.attempt.quantity > remainingQuantity
    ? "stale_conflict"
    : "retryable";
}

export function startFulfillmentAttempt(
  state: FulfillmentAttemptState,
  draft: FulfillmentAttemptDraft,
  createIdempotencyKey: () => string,
  remainingQuantity: number,
): { state: FulfillmentAttemptState; attempt: FulfillmentAttempt | null } {
  if (state.phase === "submitting") return { state, attempt: null };

  if (state.phase === "failed") {
    const retryStatus = getFulfillmentRetryStatus(
      state,
      draft.requestId,
      draft.requestLineId,
      remainingQuantity,
    );
    if (retryStatus !== "retryable") return { state, attempt: null };

    const nextState: FulfillmentAttemptState = {
      phase: "submitting",
      attempt: state.attempt,
    };
    return { state: nextState, attempt: state.attempt };
  }

  if (!validQuantity(draft.quantity, remainingQuantity)) {
    return { state, attempt: null };
  }

  const attempt = { ...draft, idempotencyKey: createIdempotencyKey() };
  return {
    state: { phase: "submitting", attempt },
    attempt,
  };
}

export function failFulfillmentAttempt(
  state: FulfillmentAttemptState,
  errorCode: string,
  remainingAtFailure: number,
): { state: FulfillmentAttemptState; refresh: boolean } {
  if (state.phase !== "submitting") return { state, refresh: false };

  return {
    state: {
      phase: "failed",
      attempt: state.attempt,
      errorCode,
      remainingAtFailure,
    },
    refresh: errorCode === "FULFILLMENT_EXCEEDS_REMAINING",
  };
}

export function completeFulfillmentAttempt(
  state: FulfillmentAttemptState,
): FulfillmentAttemptState {
  return state.phase === "submitting" ? IDLE_FULFILLMENT_ATTEMPT : state;
}
