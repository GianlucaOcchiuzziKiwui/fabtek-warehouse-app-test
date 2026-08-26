"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  createEmptyDraft,
  parsePersistedRequestDraft,
  requestDraftReducer,
  type RequestDraft,
  type RequestDraftHeader,
  type RequestDraftLine,
} from "@/lib/domain/requests/draft";
import {
  IDLE_REQUEST_ATTEMPT,
  startRequestAttempt,
  type RequestAttemptState,
} from "@/lib/domain/requests/attempt-state";
import type { SubmitRequestInput } from "@/lib/domain/requests/contracts";

const STORAGE_KEY = "fabtek:material-request-draft:v1";

type RequestDraftContextValue = {
  draft: RequestDraft;
  setHeader: (header: Partial<RequestDraftHeader>) => void;
  addLine: (line: RequestDraftLine) => void;
  setQuantity: (itemVariantId: string, quantity: number) => void;
  removeLine: (itemVariantId: string) => void;
  resetDraft: () => void;
  isSubmissionLocked: boolean;
  requestAttemptState: RequestAttemptState;
  startSubmissionAttempt: (input: unknown) => {
    state: RequestAttemptState;
    attempt: SubmitRequestInput | null;
  };
  replaceRequestAttemptState: (state: RequestAttemptState) => void;
};

const RequestDraftContext = createContext<RequestDraftContextValue | null>(null);

export function RequestDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, dispatch] = useReducer(requestDraftReducer, undefined, createEmptyDraft);
  const [isHydrated, setIsHydrated] = useState(false);
  const [requestAttemptState, setRequestAttemptState] = useState<RequestAttemptState>(
    IDLE_REQUEST_ATTEMPT,
  );
  const requestAttemptStateRef = useRef<RequestAttemptState>(IDLE_REQUEST_ATTEMPT);
  const isSubmissionLocked = requestAttemptState.phase !== "idle";

  function dispatchDraft(action: Parameters<typeof dispatch>[0]) {
    if (requestAttemptStateRef.current.phase === "idle") dispatch(action);
  }

  function replaceRequestAttemptState(state: RequestAttemptState) {
    requestAttemptStateRef.current = state;
    setRequestAttemptState(state);
  }

  function startSubmissionAttempt(input: unknown) {
    const started = startRequestAttempt(requestAttemptStateRef.current, input);
    if (started.attempt) replaceRequestAttemptState(started.state);
    return started;
  }

  useEffect(() => {
    try {
      const restored = parsePersistedRequestDraft(sessionStorage.getItem(STORAGE_KEY));
      if (restored) {
        dispatch({ type: "hydrate", draft: restored });
      }
    } catch {
      // A blocked or unavailable browser storage must not stop the request flow.
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // The in-memory draft remains usable when browser storage is unavailable.
    }
  }, [draft, isHydrated]);

  const value: RequestDraftContextValue = {
    draft,
    setHeader: (header) => dispatchDraft({ type: "set-header", header }),
    addLine: (line) => dispatchDraft({ type: "add-line", line }),
    setQuantity: (itemVariantId, quantity) => (
      dispatchDraft({ type: "set-quantity", itemVariantId, quantity })
    ),
    removeLine: (itemVariantId) => dispatchDraft({ type: "remove-line", itemVariantId }),
    resetDraft: () => {
      if (requestAttemptStateRef.current.phase !== "idle") return;
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // A blocked or unavailable browser storage must not stop the request flow.
      }
      dispatch({ type: "reset" });
    },
    isSubmissionLocked,
    requestAttemptState,
    startSubmissionAttempt,
    replaceRequestAttemptState,
  };

  return (
    <RequestDraftContext.Provider value={value}>{children}</RequestDraftContext.Provider>
  );
}

export function useRequestDraft() {
  const context = useContext(RequestDraftContext);

  if (!context) {
    throw new Error("useRequestDraft deve essere usato dentro RequestDraftProvider.");
  }

  return context;
}
