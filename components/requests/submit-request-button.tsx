"use client";

import { submitRequestAction } from "@/app/(app)/richieste/nuova/actions";
import { useRequestDraft } from "@/components/requests/request-draft-provider";
import { Button } from "@/components/ui/button";
import {
  completeRequestAttempt,
  failRequestAttempt,
  getRequestRetryStatus,
} from "@/lib/domain/requests/attempt-state";
import { Send, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SubmitRequestButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const {
    draft,
    resetDraft,
    requestAttemptState,
    startSubmissionAttempt,
    replaceRequestAttemptState,
  } = useRequestDraft();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const retryStatus = getRequestRetryStatus(requestAttemptState, draft.clientRequestId);

  function submit() {
    const started = startSubmissionAttempt({
      clientRequestId: draft.clientRequestId,
      project: draft.header.project,
      toolLine: draft.header.toolLine,
      utilities: draft.header.utilities,
      notes: draft.header.notes,
      lines: draft.lines,
    });
    if (!started.attempt) return;

    setErrorMessage(null);
    const attempt = started.attempt;
    startTransition(async () => {
      try {
        const result = await submitRequestAction(attempt);

        if (!result.ok) {
          replaceRequestAttemptState(failRequestAttempt(started.state, result.error.code));
          setErrorMessage(result.error.message);
          return;
        }

        const completed = completeRequestAttempt(
          started.state,
          attempt.clientRequestId,
        );
        if (completed.phase !== "idle") {
          replaceRequestAttemptState(failRequestAttempt(started.state, "UNEXPECTED_ERROR"));
          setErrorMessage("La conferma ricevuta non corrisponde al tentativo corrente. Riprova.");
          return;
        }

        replaceRequestAttemptState(completed);
        resetDraft();
        router.replace(`/richieste/${result.data.requestId}?created=1`);
      } catch {
        replaceRequestAttemptState(failRequestAttempt(started.state, "UNEXPECTED_ERROR"));
        setErrorMessage("Non Ã¨ stato possibile confermare l'invio. Riprova.");
      }
    });
  }

  const lockedAttempt = requestAttemptState.phase === "idle"
    ? null
    : requestAttemptState.attempt;
  const canSubmit = retryStatus === "retryable"
    || (retryStatus === "idle" && !disabled);
  const label = retryStatus === "submitting" || isPending
    ? "Invio in corso..."
    : retryStatus === "retryable"
      ? "Ritenta stessa richiesta"
      : retryStatus === "context_changed"
        ? "Tentativo non ripetibile"
        : "Invia richiesta";

  return (
    <div className="space-y-2">
      {errorMessage ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {errorMessage}
            {retryStatus === "retryable"
              ? " Il retry userÃ  gli stessi dati del primo tentativo."
              : " Riapri la bozza prima di continuare."}
          </span>
        </p>
      ) : null}
      {lockedAttempt ? (
        <p className="text-sm text-muted-foreground">
          Tentativo bloccato: progetto {lockedAttempt.project}, {lockedAttempt.lines.length} articol
          {lockedAttempt.lines.length === 1 ? "o" : "i"}. I campi restano bloccati fino alla conferma.
        </p>
      ) : null}
      <Button type="button" onClick={submit} disabled={!canSubmit || isPending}>
        <Send aria-hidden="true" />
        {label}
      </Button>
    </div>
  );
}
