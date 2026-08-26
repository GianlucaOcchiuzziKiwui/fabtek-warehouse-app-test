import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";
import Link from "next/link";

export default function RequestNotFound() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <FileQuestion aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
      <h1 className="mt-4 font-heading text-2xl font-semibold text-foreground">
        Richiesta non trovata
      </h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        La richiesta non esiste oppure non Ã¨ visibile con il tuo profilo.
      </p>
      <Button asChild variant="outline" className="mt-5">
        <Link href="/richieste">Torna alle richieste</Link>
      </Button>
    </div>
  );
}
