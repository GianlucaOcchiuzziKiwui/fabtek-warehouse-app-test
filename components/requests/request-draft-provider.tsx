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
import {
  parsePersistedRequestFlow,
  serializeRequestFlow,
} from "@/lib/domain/requests/flow-storage";

const STORAGE_KEY = "fabtek:material-request-flow:v1";
const LEGACY_SESSION_STORAGE_KEY = "fabtek:material-request-draft:v1";

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
  isHydrated: boolean;
};

const RequestDraftContext = createContext<RequestDraftContextValue | null>(null);

export function RequestDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, dispatch] = useReducer(requestDraftReducer, undefined, createEmptyDraft);
  const [isHydrated, setIsHydrated] = useState(false);
  const [requestAttemptState, setRequestAttemptState] = useState<RequestAttemptState>(
    IDLE_REQUEST_ATTEMPT,
  );
  const requestAttemptStateRef = useRef<RequestAttemptState>(IDLE_REQUEST_ATTEMPT);
  const isHydratedRef = useRef(false);
  const isSubmissionLocked = requestAttemptState.phase !== "idle";

  function dispatchDraft(action: Parameters<typeof dispatch>[0]) {
    if (requestAttemptStateRef.current.phase === "idle") dispatch(action);
  }

  function replaceRequestAttemptState(state: RequestAttemptState) {
    requestAttemptStateRef.current = state;
    setRequestAttemptState(state);
    if (isHydratedRef.current) {
      try {
        localStorage.setItem(STORAGE_KEY, serializeRequestFlow(draft, state));
      } catch {
        // The in-memory lock remains authoritative while this page is open.
      }
    }
  }

  function startSubmissionAttempt(input: unknown) {
    if (!isHydratedRef.current) {
      return { state: requestAttemptStateRef.current, attempt: null };
    }
    const started = startRequestAttempt(requestAttemptStateRef.current, input);
    if (started.attempt) {
      try {
        localStorage.setItem(STORAGE_KEY, serializeRequestFlow(draft, started.state));
      } catch {
        const blockedState: RequestAttemptState = {
          phase: "blocked",
          clientRequestId: draft.clientRequestId,
          errorCode: "LOCAL_STORAGE_UNAVAILABLE",
          attempt: started.attempt,
        };
        requestAttemptStateRef.current = blockedState;
        setRequestAttemptState(blockedState);
        return { state: blockedState, attempt: null };
      }
      requestAttemptStateRef.current = started.state;
      setRequestAttemptState(started.state);
    }
    return started;
  }

  useEffect(() => {
    try {
      const restored = parsePersistedRequestFlow(localStorage.getItem(STORAGE_KEY));
      if (restored) {
        dispatch({ type: "hydrate", draft: restored.draft });
        requestAttemptStateRef.current = restored.attemptState;
        setRequestAttemptState(restored.attemptState);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    } catch {
      // A blocked or unavailable browser storage must not stop the request flow.
    } finally {
      isHydratedRef.current = true;
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        serializeRequestFlow(draft, requestAttemptState),
      );
    } catch {
      // The in-memory draft remains usable when browser storage is unavailable.
    }
  }, [draft, isHydrated, requestAttemptState]);

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
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // A blocked or unavailable browser storage must not stop the request flow.
      }
      dispatch({ type: "reset" });
    },
    isSubmissionLocked,
    requestAttemptState,
    startSubmissionAttempt,
    replaceRequestAttemptState,
    isHydrated,
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
