"use client";

import { submitRequestAction } from "@/app/(app)/richieste/nuova/actions";
import { useRequestDraft } from "@/components/requests/request-draft-provider";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SubmitRequestButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const { draft, resetDraft } = useRequestDraft();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function submit() {
    if (isPending) return;

    setErrorMessage(null);
    startTransition(async () => {
      const result = await submitRequestAction({
        clientRequestId: draft.clientRequestId,
        project: draft.header.project,
        toolLine: draft.header.toolLine,
        utilities: draft.header.utilities,
        notes: draft.header.notes,
        lines: draft.lines,
      });

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      resetDraft();
      router.replace(`/richieste/${result.data.requestId}?created=1`);
    });
  }

  return (
    <div className="space-y-2">
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">{errorMessage}</p>
      ) : null}
      <Button type="button" onClick={submit} disabled={disabled || isPending}>
        <Send aria-hidden="true" />
        {isPending ? "Invio in corso..." : "Invia richiesta"}
      </Button>
    </div>
  );
}
