"use client";

import { useProfile } from "@/components/auth/profile-context";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequestDraft } from "@/components/requests/request-draft-provider";
import { CheckCircle2, CircleAlert } from "lucide-react";

export function isRequestHeaderComplete(header: {
  project: string;
  toolLine: string;
  utilities: string;
}) {
  const project = header.project.trim();
  const toolLine = header.toolLine.trim();
  const utilities = header.utilities.trim();

  return Boolean(
    project
    && project.length <= 120
    && toolLine
    && toolLine.length <= 120
    && utilities
    && utilities.length <= 240,
  );
}

export function RequestHeaderForm() {
  const { profile } = useProfile();
  const { draft, setHeader } = useRequestDraft();
  const isComplete = isRequestHeaderComplete(draft.header);

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
            maxLength={120}
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
            maxLength={120}
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
            maxLength={240}
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
            rows={3}
            className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
      </CardContent>
    </Card>
  );
}
