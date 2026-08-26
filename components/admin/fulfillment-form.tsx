"use client";

import { fulfillRequestLineAction } from "@/app/(app)/admin/richieste/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, PackageCheck, TriangleAlert } from "lucide-react";
import { type FormEvent, useRef, useState, useTransition } from "react";

export function FulfillmentForm({
  requestLineId,
  remainingQuantity,
}: {
  requestLineId: string;
  remainingQuantity: number;
}) {
  const quantityId = `fulfillment-quantity-${requestLineId}`;
  const notesId = `fulfillment-notes-${requestLineId}`;
  const feedbackId = `fulfillment-feedback-${requestLineId}`;
  const idempotencyKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const [quantity, setQuantity] = useState("0");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || isPending) return;

    submitting.current = true;
    setFeedback(null);
    idempotencyKey.current ??= crypto.randomUUID();
    const attemptKey = idempotencyKey.current;

    startTransition(async () => {
      try {
        const result = await fulfillRequestLineAction({
          requestLineId,
          quantity: Number(quantity),
          idempotencyKey: attemptKey,
          notes,
        });

        if (!result.ok) {
          setFeedback({ kind: "error", message: result.error.message });
          return;
        }

        idempotencyKey.current = null;
        setQuantity("0");
        setNotes("");
        setFeedback({
          kind: "success",
          message: `Consegna registrata. Quantità residua: ${result.data.remainingQuantity}.`,
        });
      } catch {
        setFeedback({
          kind: "error",
          message: "Non è stato possibile registrare la consegna. Riprova.",
        });
      } finally {
        submitting.current = false;
      }
    });
  }

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
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-describedby={feedback ? feedbackId : undefined}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={notesId}>Note <span className="font-normal text-muted-foreground">(facoltative)</span></Label>
          <textarea
            id={notesId}
            name="notes"
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isPending}
            className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          />
        </div>
      </div>

      {feedback ? (
        <p
          id={feedbackId}
          role={feedback.kind === "error" ? "alert" : "status"}
          className={feedback.kind === "error"
            ? "flex items-start gap-2 text-sm text-destructive"
            : "flex items-start gap-2 text-sm text-status-good"}
        >
          {feedback.kind === "error" ? (
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          <span><strong>{feedback.kind === "error" ? "Errore:" : "Conferma:"}</strong> {feedback.message}</span>
        </p>
      ) : null}

      <Button type="submit" disabled={isPending}>
        <PackageCheck aria-hidden="true" />
        {isPending ? "Registrazione in corso..." : "Registra consegna"}
      </Button>
    </form>
  );
}
