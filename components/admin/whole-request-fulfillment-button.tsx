"use client";

import { fulfillWholeRequestAction } from "@/app/(app)/admin/richieste/actions";
import { Button } from "@/components/ui/button";
import { CheckCircle2, PackageCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

export function WholeRequestFulfillmentButton({
  requestId,
  remainingLineCount,
}: {
  requestId: string;
  remainingLineCount: number;
}) {
  const router = useRouter();
  const idempotencyKeyRef = useRef<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  function fulfillAll() {
    if (
      !idempotencyKeyRef.current
      && !window.confirm(
        `Evadi completamente ${remainingLineCount} ${remainingLineCount === 1 ? "riga" : "righe"}? L'operazione aggiornerà anche le giacenze.`,
      )
    ) {
      return;
    }

    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    setFeedback(null);

    startTransition(async () => {
      try {
        const result = await fulfillWholeRequestAction({
          requestId,
          idempotencyKey,
        });
        if (!result.ok) {
          setFeedback({ kind: "error", message: result.error.message });
          if (result.error.code === "REQUEST_ALREADY_FULFILLED") router.refresh();
          return;
        }

        setFeedback({
          kind: "success",
          message: `${result.data.fulfilledLineCount} ${result.data.fulfilledLineCount === 1 ? "riga evasa" : "righe evase"} completamente.`,
        });
        router.refresh();
      } catch {
        setFeedback({
          kind: "error",
          message: "Non è stato possibile evadere la richiesta. Riprova.",
        });
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={fulfillAll} disabled={isPending}>
        <PackageCheck aria-hidden="true" />
        {isPending ? "Evasione in corso..." : "Evadi tutto"}
      </Button>
      {feedback ? (
        <p
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
          <span>{feedback.message}</span>
        </p>
      ) : null}
    </div>
  );
}
