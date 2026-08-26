"use client";

import { fulfillRequestLineAction } from "@/app/(app)/admin/richieste/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  completeFulfillmentAttempt,
  failFulfillmentAttempt,
  getFulfillmentRetryStatus,
  IDLE_FULFILLMENT_ATTEMPT,
  matchesFulfillmentAttemptResult,
  startFulfillmentAttempt,
  type FulfillmentAttemptState,
} from "@/lib/domain/fulfillment/attempt-state";
import { CheckCircle2, PackageCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";

export function FulfillmentForm({
  requestId,
  requestLineId,
  remainingQuantity,
}: {
  requestId: string;
  requestLineId: string;
  remainingQuantity: number;
}) {
  const router = useRouter();
  const quantityId = `fulfillment-quantity-${requestLineId}`;
  const notesId = `fulfillment-notes-${requestLineId}`;
  const feedbackId = `fulfillment-feedback-${requestLineId}`;
  const attemptSummaryId = `fulfillment-attempt-${requestLineId}`;
  const [attemptState, setAttemptState] = useState<FulfillmentAttemptState>(
    IDLE_FULFILLMENT_ATTEMPT,
  );
  const attemptStateRef = useRef<FulfillmentAttemptState>(
    IDLE_FULFILLMENT_ATTEMPT,
  );
  const [quantity, setQuantity] = useState("0");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const retryStatus = getFulfillmentRetryStatus(
    attemptState,
    requestId,
    requestLineId,
    remainingQuantity,
  );
  const lockedAttempt = attemptState.phase === "idle"
    ? null
    : attemptState.attempt;
  const canSubmit = retryStatus === "idle" || retryStatus === "retryable";

  function replaceAttemptState(state: FulfillmentAttemptState) {
    attemptStateRef.current = state;
    setAttemptState(state);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const started = startFulfillmentAttempt(
      attemptStateRef.current,
      {
        requestId,
        requestLineId,
        quantity: Number(quantity),
        notes,
      },
      () => crypto.randomUUID(),
      remainingQuantity,
    );
    if (!started.attempt) return;

    replaceAttemptState(started.state);
    setFeedback(null);
    const attempt = started.attempt;

    startTransition(async () => {
      try {
        const result = await fulfillRequestLineAction({
          requestLineId: attempt.requestLineId,
          quantity: attempt.quantity,
          idempotencyKey: attempt.idempotencyKey,
          notes: attempt.notes,
        });

        if (!result.ok) {
          const failed = failFulfillmentAttempt(
            started.state,
            result.error.code,
            remainingQuantity,
          );
          replaceAttemptState(failed.state);
          setFeedback({ kind: "error", message: result.error.message });
          if (failed.refresh) router.refresh();
          return;
        }

        if (!matchesFulfillmentAttemptResult(attempt, result.data)) {
          const failed = failFulfillmentAttempt(
            started.state,
            "UNEXPECTED_ERROR",
            remainingQuantity,
          );
          replaceAttemptState(failed.state);
          setFeedback({
            kind: "error",
            message: "La risposta ricevuta non corrisponde alla richiesta aperta. Riprova.",
          });
          return;
        }

        replaceAttemptState(completeFulfillmentAttempt(started.state));
        setQuantity("0");
        setNotes("");
        setFeedback({
          kind: "success",
          message: `Consegna registrata. Quantità residua: ${result.data.remainingQuantity}.`,
        });
      } catch {
        const failed = failFulfillmentAttempt(
          started.state,
          "UNEXPECTED_ERROR",
          remainingQuantity,
        );
        replaceAttemptState(failed.state);
        setFeedback({
          kind: "error",
          message: "Non è stato possibile registrare la consegna. Riprova.",
        });
      }
    });
  }

  let displayedFeedback = feedback;
  if (attemptState.phase === "failed") {
    if (retryStatus === "refreshing_conflict") {
      displayedFeedback = {
        kind: "error",
        message: "Il residuo è cambiato. Aggiornamento del dettaglio in corso; il tentativo originale resta bloccato.",
      };
    } else if (retryStatus === "stale_conflict") {
      displayedFeedback = {
        kind: "error",
        message: `Il tentativo originale di ${attemptState.attempt.quantity} unità supera il nuovo residuo di ${remainingQuantity} e non può essere ripetuto. Riapri il dettaglio prima di creare una nuova consegna.`,
      };
    } else if (retryStatus === "context_changed") {
      displayedFeedback = {
        kind: "error",
        message: "Il dettaglio aperto non corrisponde più al tentativo. Riapri la richiesta prima di continuare.",
      };
    } else if (
      retryStatus === "retryable"
      && attemptState.errorCode === "FULFILLMENT_EXCEEDS_REMAINING"
    ) {
      displayedFeedback = {
        kind: "error",
        message: `Residuo aggiornato. Puoi ritentare soltanto la consegna originale di ${attemptState.attempt.quantity} unità.`,
      };
    } else if (displayedFeedback) {
      displayedFeedback = {
        ...displayedFeedback,
        message: `${displayedFeedback.message} Il retry userà gli stessi dati del primo tentativo.`,
      };
    }
  }

  const describedBy = [
    displayedFeedback ? feedbackId : null,
    lockedAttempt ? attemptSummaryId : null,
  ].filter(Boolean).join(" ") || undefined;
  const submitLabel = attemptState.phase === "submitting"
    ? "Registrazione in corso..."
    : retryStatus === "retryable"
      ? "Ritenta stessa consegna"
      : retryStatus === "refreshing_conflict"
        ? "Aggiornamento residuo..."
        : retryStatus === "stale_conflict" || retryStatus === "context_changed"
          ? "Tentativo non ripetibile"
          : "Registra consegna";

  return (
    <form onSubmit={submit} className="mt-5 space-y-4 rounded-lg border border-border bg-background p-4">
      <div>
        <h3 className="font-heading text-base font-semibold text-foreground">
          Registra consegna
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Indica quante unità consegnare, fino al residuo di {remainingQuantity}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label htmlFor={quantityId}>Quantità</Label>
          <Input
            id={quantityId}
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={remainingQuantity}
            step={1}
            required
            value={lockedAttempt ? String(lockedAttempt.quantity) : quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={retryStatus === "stale_conflict"}
            disabled={attemptState.phase !== "idle"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={notesId}>Note <span className="font-normal text-muted-foreground">(facoltative)</span></Label>
          <textarea
            id={notesId}
            name="notes"
            rows={2}
            value={lockedAttempt ? lockedAttempt.notes : notes}
            onChange={(event) => setNotes(event.target.value)}
            aria-describedby={describedBy}
            disabled={attemptState.phase !== "idle"}
            className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          />
        </div>
      </div>

      {lockedAttempt ? (
        <p id={attemptSummaryId} className="text-sm text-muted-foreground">
          Tentativo corrente bloccato: {lockedAttempt.quantity} unità
          {lockedAttempt.notes ? `; note: ${lockedAttempt.notes}` : "; senza note"}.
        </p>
      ) : null}

      {displayedFeedback ? (
        <p
          id={feedbackId}
          role={displayedFeedback.kind === "error" ? "alert" : "status"}
          className={displayedFeedback.kind === "error"
            ? "flex items-start gap-2 text-sm text-destructive"
            : "flex items-start gap-2 text-sm text-status-good"}
        >
          {displayedFeedback.kind === "error" ? (
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          <span><strong>{displayedFeedback.kind === "error" ? "Errore:" : "Conferma:"}</strong> {displayedFeedback.message}</span>
        </p>
      ) : null}

      <Button type="submit" disabled={isPending || !canSubmit}>
        <PackageCheck aria-hidden="true" />
        {submitLabel}
      </Button>
    </form>
  );
}
