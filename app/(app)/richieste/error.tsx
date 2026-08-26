"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function RequestsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Request route rendering failed", { digest: error.digest });
  }, [error]);

  return (
    <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle aria-hidden="true" className="mx-auto size-9 text-destructive" />
      <h1 className="mt-4 font-heading text-2xl font-semibold text-foreground">
        Impossibile caricare le richieste
      </h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Si Ã¨ verificato un errore inatteso. Riprova senza perdere la pagina corrente.
      </p>
      <Button type="button" variant="outline" onClick={retry} className="mt-5">
        <RotateCcw aria-hidden="true" />
        Riprova
      </Button>
    </div>
  );
}
