"use client";

import { useProfile } from "@/components/auth/profile-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequestDraft } from "@/components/requests/request-draft-provider";
import { isRequiredTextWithinLimit } from "@/lib/domain/requests/validation";
import { ArrowRight, CheckCircle2, CircleAlert, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";

export function isRequestHeaderComplete(header: {
  project: string;
  toolLine: string;
  utilities: string;
}) {
  return isRequiredTextWithinLimit(header.project, 120)
    && isRequiredTextWithinLimit(header.toolLine, 120)
    && isRequiredTextWithinLimit(header.utilities, 240);
}

export function RequestHeaderForm({ continueHref }: { continueHref: string }) {
  const { profile } = useProfile();
  const router = useRouter();
  const { draft, setHeader, isSubmissionLocked, isHydrated } = useRequestDraft();
  const isComplete = isRequestHeaderComplete(draft.header);

  function continueToMaterials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isHydrated || !isComplete || isSubmissionLocked) return;
    router.push(continueHref);
  }

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">1. Intestazione</p>
            <h2 className="mt-1 font-heading text-lg font-semibold">Dati della richiesta</h2>
          </div>
          <p
            role="status"
            className={isComplete
              ? "inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"
              : "inline-flex items-center gap-1.5 text-sm font-medium text-amber-700"}
          >
            {isComplete ? <CheckCircle2 aria-hidden="true" className="size-4" /> : <CircleAlert aria-hidden="true" className="size-4" />}
            {isComplete ? "Intestazione completa" : "Completa i campi obbligatori"}
          </p>
        </div>
      </CardHeader>
      <form onSubmit={continueToMaterials} className="space-y-6">
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="requester">Richiedente</Label>
            <Input id="requester" value={profile.full_name} readOnly disabled />
            <p className="text-xs text-muted-foreground">Deriva dal profilo autenticato.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="request-project">Progetto #</Label>
            <Input
              id="request-project"
              value={draft.header.project}
              onChange={(event) => setHeader({ project: event.target.value })}
              disabled={isSubmissionLocked}
              required
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="request-tool-line">Tool / Line #</Label>
            <Input
              id="request-tool-line"
              value={draft.header.toolLine}
              onChange={(event) => setHeader({ toolLine: event.target.value })}
              disabled={isSubmissionLocked}
              required
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="request-utilities">Utilities</Label>
            <Input
              id="request-utilities"
              value={draft.header.utilities}
              onChange={(event) => setHeader({ utilities: event.target.value })}
              disabled={isSubmissionLocked}
              required
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">Testo libero, distinto dalla categoria degli articoli.</p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="request-notes">Note</Label>
            <textarea
              id="request-notes"
              value={draft.header.notes}
              onChange={(event) => setHeader({ notes: event.target.value })}
              disabled={isSubmissionLocked}
              rows={3}
              className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
          <p className="text-xs leading-5 text-muted-foreground">
            I dati restano nella bozza locale. La richiesta viene creata soltanto alla conferma finale.
          </p>
          <Button
            type="submit"
            className="shrink-0"
            disabled={!isHydrated || !isComplete || isSubmissionLocked}
          >
            Salva e scegli i prodotti
            <ArrowRight aria-hidden="true" />
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function RequestMaterialsGate({ children }: { children: ReactNode }) {
  const { draft, isHydrated } = useRequestDraft();
  const isComplete = isRequestHeaderComplete(draft.header);

  if (!isHydrated) {
    return <div className="h-48 animate-pulse rounded-xl border border-border bg-muted/60" aria-label="Caricamento bozza richiesta" />;
  }

  if (!isComplete) {
    return (
      <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
        <LockKeyhole aria-hidden="true" className="size-7" />
        <h2 className="mt-4 font-heading text-xl font-semibold">Completa prima i dati della richiesta</h2>
        <p className="mt-2 max-w-xl text-sm leading-6">
          Progetto #, Tool / Line # e Utilities sono obbligatori prima di scegliere i prodotti.
        </p>
        <Button asChild className="mt-5">
          <Link href="/richieste/nuova">Vai allo step 1</Link>
        </Button>
      </div>
    );
  }

  return children;
}
