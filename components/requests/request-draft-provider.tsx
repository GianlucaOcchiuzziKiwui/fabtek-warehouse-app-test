"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
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

const STORAGE_KEY = "fabtek:material-request-draft:v1";

type RequestDraftContextValue = {
  draft: RequestDraft;
  setHeader: (header: Partial<RequestDraftHeader>) => void;
  addLine: (line: RequestDraftLine) => void;
  setQuantity: (itemVariantId: string, quantity: number) => void;
  removeLine: (itemVariantId: string) => void;
  resetDraft: () => void;
};

const RequestDraftContext = createContext<RequestDraftContextValue | null>(null);

export function RequestDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, dispatch] = useReducer(requestDraftReducer, undefined, createEmptyDraft);
  const [isHydrated, setIsHydrated] = useState(false);

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
    setHeader: (header) => dispatch({ type: "set-header", header }),
    addLine: (line) => dispatch({ type: "add-line", line }),
    setQuantity: (itemVariantId, quantity) => (
      dispatch({ type: "set-quantity", itemVariantId, quantity })
    ),
    removeLine: (itemVariantId) => dispatch({ type: "remove-line", itemVariantId }),
    resetDraft: () => {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // A blocked or unavailable browser storage must not stop the request flow.
      }
      dispatch({ type: "reset" });
    },
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
