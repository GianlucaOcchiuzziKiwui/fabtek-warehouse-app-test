"use client";

import { useProfile } from "@/components/auth/profile-context";
import { isRequestHeaderComplete } from "@/components/requests/request-header-form";
import { useRequestDraft } from "@/components/requests/request-draft-provider";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { SubmitRequestButton } from "@/components/requests/submit-request-button";
import { canAddDraftLine } from "@/lib/domain/requests/line-rules";
import { ArrowLeft, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export type DraftLineDetails = {
  itemVariantId: string;
  categoryId: string;
  partNumber: string;
  category: string;
  family: string;
  item: string;
  size: string;
  material: string;
  connection: string;
  stock: {
    trackInventory: boolean;
    availableQuantity: number | null;
  };
};

type ResolvedDraftLine = DraftLineDetails & { quantity: number; resolved: true };

type UnresolvedDraftLine = {
  itemVariantId: string;
  categoryId: string;
  quantity: number;
  resolved: false;
};

type DraftSummaryLine = ResolvedDraftLine | UnresolvedDraftLine;

type LineValidation = {
  input: string;
  result: ReturnType<typeof canAddDraftLine>;
};

function valueOrDash(value: string) {
  return value || "—";
}

function RequestData({
  requester,
  previewDate,
  project,
  toolLine,
  utilities,
  notes,
}: {
  requester: string;
  previewDate: string;
  project: string;
  toolLine: string;
  utilities: string;
  notes: string;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <div><dt className="text-muted-foreground">Richiedente</dt><dd className="font-semibold">{requester}</dd></div>
      <div><dt className="text-muted-foreground">Data richiesta</dt><dd className="font-semibold">{previewDate}</dd></div>
      <div><dt className="text-muted-foreground">Progetto #</dt><dd className="font-semibold">{valueOrDash(project)}</dd></div>
      <div><dt className="text-muted-foreground">Tool / Line #</dt><dd className="font-semibold">{valueOrDash(toolLine)}</dd></div>
      <div><dt className="text-muted-foreground">Utilities</dt><dd className="font-semibold">{valueOrDash(utilities)}</dd></div>
      <div><dt className="text-muted-foreground">Note</dt><dd className="whitespace-pre-wrap font-semibold">{valueOrDash(notes)}</dd></div>
    </dl>
  );
}

function PrintTable({ lines }: { lines: ResolvedDraftLine[] }) {
  return (
    <table className="w-full border-collapse text-left text-[10px]">
      <thead>
        <tr className="bg-slate-100">
          {[
            "Part #",
            "Categoria",
            "Famiglia",
            "Articolo",
            "Misura",
            "Materiale",
            "Connessione",
            "Quantità",
          ].map((heading) => (
            <th key={heading} scope="col" className="border border-slate-300 px-2 py-2 font-semibold">{heading}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.itemVariantId} className="print-table-row align-top">
            <td className="border border-slate-300 px-2 py-2 font-semibold">{line.partNumber}</td>
            <td className="border border-slate-300 px-2 py-2">{valueOrDash(line.category)}</td>
            <td className="border border-slate-300 px-2 py-2">{valueOrDash(line.family)}</td>
            <td className="border border-slate-300 px-2 py-2">{valueOrDash(line.item)}</td>
            <td className="border border-slate-300 px-2 py-2">{valueOrDash(line.size)}</td>
            <td className="border border-slate-300 px-2 py-2">{valueOrDash(line.material)}</td>
            <td className="border border-slate-300 px-2 py-2">{valueOrDash(line.connection)}</td>
            <td className="border border-slate-300 px-2 py-2 text-right font-semibold">{line.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuantityEditor({
  controlId,
  line,
  validation,
  onChange,
}: {
  controlId: string;
  line: ResolvedDraftLine;
  validation: LineValidation;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={controlId} className="sr-only">Quantità {line.partNumber}</label>
      <input
        id={controlId}
        type="number"
        value={validation.input}
        onChange={(event) => onChange(event.target.value)}
        min={1}
        max={line.stock.trackInventory && line.stock.availableQuantity !== null
          ? line.stock.availableQuantity
          : 999_999}
        step={1}
        inputMode="numeric"
        aria-invalid={!validation.result.ok}
        className="h-9 w-28 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive"
      />
      {!validation.result.ok ? (
        <p className="mt-1 max-w-48 text-xs text-destructive">{validation.result.error.message}</p>
      ) : null}
    </div>
  );
}

function RemoveLineButton({
  itemVariantId,
  label,
  onRemove,
}: {
  itemVariantId: string;
  label: string;
  onRemove: (itemVariantId: string) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Rimuovi ${label}`}
      onClick={() => onRemove(itemVariantId)}
    >
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

export function DraftPrintView({
  details,
  previewDate,
}: {
  details: DraftLineDetails[];
  previewDate: string;
}) {
  const { profile } = useProfile();
  const { draft, setQuantity, removeLine } = useRequestDraft();
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const detailsByLine = useMemo(
    () => new Map(details.map((line) => [`${line.itemVariantId}:${line.categoryId}`, line])),
    [details],
  );
  const lines = draft.lines.map<DraftSummaryLine>((draftLine) => {
    const detail = detailsByLine.get(`${draftLine.itemVariantId}:${draftLine.categoryId}`);
    return detail
      ? { ...detail, quantity: draftLine.quantity, resolved: true }
      : { ...draftLine, resolved: false };
  });
  const resolvedLines = lines.filter(
    (line): line is ResolvedDraftLine => line.resolved,
  );
  const hasUnresolvedLines = resolvedLines.length !== lines.length;
  const lineValidations = resolvedLines.map((line) => {
    const input = quantityInputs[line.itemVariantId] ?? String(line.quantity);
    return {
      itemVariantId: line.itemVariantId,
      input,
      result: canAddDraftLine(line, Number(input)),
    };
  });
  const validationsById = new Map(
    lineValidations.map(({ itemVariantId, ...validation }) => [itemVariantId, validation]),
  );
  const hasInvalidQuantities = lineValidations.some(({ result }) => !result.ok);
  const headerIsComplete = isRequestHeaderComplete(draft.header);
  const canPrint = resolvedLines.length > 0
    && !hasUnresolvedLines
    && !hasInvalidQuantities
    && headerIsComplete;

  function updateQuantity(line: ResolvedDraftLine, value: string) {
    setQuantityInputs((current) => ({ ...current, [line.itemVariantId]: value }));
    const quantity = Number(value);
    if (canAddDraftLine(line, quantity).ok) {
      setQuantity(line.itemVariantId, quantity);
    }
  }

  if (draft.lines.length === 0) {
    return (
      <div className="screen-only">
        <EmptyState
          title="La bozza è vuota"
          description="Aggiungi almeno un articolo prima di aprire il riepilogo."
          action={<Button asChild><Link href="/richieste/nuova">Scegli materiali</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="screen-only space-y-6">
        {hasUnresolvedLines ? (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Alcune righe della bozza non sono più verificabili. Rimuovile dal riepilogo prima di stampare.
          </div>
        ) : null}
        {!headerIsComplete ? (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Completa Progetto #, Tool / Line # e Utilities prima di stampare la bozza.
          </div>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="draft-header-title">
          <h2 id="draft-header-title" className="mb-5 font-heading text-xl font-semibold">Intestazione</h2>
          <RequestData
            requester={profile.full_name}
            previewDate={previewDate}
            project={draft.header.project}
            toolLine={draft.header.toolLine}
            utilities={draft.header.utilities}
            notes={draft.header.notes}
          />
        </section>

        <section className="space-y-3" aria-labelledby="draft-lines-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="draft-lines-title" className="font-heading text-xl font-semibold">Articoli ({lines.length})</h2>
            <p className="text-sm text-muted-foreground">Il carrello non prenota il materiale.</p>
          </div>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="w-[27%] px-4 py-3">Articolo</th>
                  <th scope="col" className="w-[18%] px-4 py-3">Categoria</th>
                  <th scope="col" className="w-[29%] px-4 py-3">Dati tecnici</th>
                  <th scope="col" className="w-[18%] px-4 py-3">Quantità</th>
                  <th scope="col" className="w-[8%] px-4 py-3"><span className="sr-only">Azioni</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => {
                  if (!line.resolved) {
                    return (
                      <tr key={line.itemVariantId} className="bg-amber-50/70 align-top">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-amber-900">Riga non disponibile</p>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{line.itemVariantId}</p>
                        </td>
                        <td className="break-all px-4 py-4 font-mono text-xs">{line.categoryId}</td>
                        <td className="px-4 py-4 text-xs text-amber-900">I dati catalogo non sono più verificabili.</td>
                        <td className="px-4 py-4 font-semibold">{line.quantity}</td>
                        <td className="px-4 py-4 text-right">
                          <RemoveLineButton
                            itemVariantId={line.itemVariantId}
                            label={`riga ${line.itemVariantId}`}
                            onRemove={removeLine}
                          />
                        </td>
                      </tr>
                    );
                  }

                  const validation = validationsById.get(line.itemVariantId);
                  if (!validation) return null;
                  return (
                    <tr key={line.itemVariantId} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-semibold">{line.partNumber}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{valueOrDash(line.family)} · {valueOrDash(line.item)}</p>
                      </td>
                      <td className="px-4 py-4">{valueOrDash(line.category)}</td>
                      <td className="px-4 py-4 text-xs">
                        <p>Misura: {valueOrDash(line.size)}</p>
                        <p>Materiale: {valueOrDash(line.material)}</p>
                        <p>Connessione: {valueOrDash(line.connection)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <QuantityEditor
                          controlId={`summary-quantity-desktop-${line.itemVariantId}`}
                          line={line}
                          validation={validation}
                          onChange={(value) => updateQuantity(line, value)}
                        />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <RemoveLineButton itemVariantId={line.itemVariantId} label={line.partNumber} onRemove={removeLine} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:hidden">
            {lines.map((line) => {
              if (!line.resolved) {
                return (
                  <article key={line.itemVariantId} className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
                    <div>
                      <h3 className="font-heading text-lg font-semibold text-amber-900">Riga non disponibile</h3>
                      <p className="mt-1 text-sm text-amber-900">I dati catalogo non sono più verificabili.</p>
                    </div>
                    <dl className="space-y-3 text-sm">
                      <div><dt className="text-xs text-muted-foreground">ID variante</dt><dd className="break-all font-mono">{line.itemVariantId}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">ID categoria</dt><dd className="break-all font-mono">{line.categoryId}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Quantità salvata</dt><dd className="font-semibold">{line.quantity}</dd></div>
                    </dl>
                    <div className="flex justify-end">
                      <RemoveLineButton
                        itemVariantId={line.itemVariantId}
                        label={`riga ${line.itemVariantId}`}
                        onRemove={removeLine}
                      />
                    </div>
                  </article>
                );
              }

              const validation = validationsById.get(line.itemVariantId);
              if (!validation) return null;
              return (
                <article key={line.itemVariantId} className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{line.partNumber}</p>
                      <h3 className="mt-1 font-heading text-lg font-semibold">{valueOrDash(line.item)}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{valueOrDash(line.family)}</p>
                    </div>
                    <RemoveLineButton itemVariantId={line.itemVariantId} label={line.partNumber} onRemove={removeLine} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Categoria</dt><dd className="font-medium">{valueOrDash(line.category)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Misura</dt><dd className="font-medium">{valueOrDash(line.size)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Materiale</dt><dd className="font-medium">{valueOrDash(line.material)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Connessione</dt><dd className="font-medium">{valueOrDash(line.connection)}</dd></div>
                  </dl>
                  <QuantityEditor
                    controlId={`summary-quantity-mobile-${line.itemVariantId}`}
                    line={line}
                    validation={validation}
                    onChange={(value) => updateQuantity(line, value)}
                  />
                </article>
              );
            })}
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button asChild variant="outline"><Link href="/richieste/nuova"><ArrowLeft aria-hidden="true" />Torna alla selezione</Link></Button>
          <div className="flex flex-col gap-3 sm:items-end">
            <SubmitRequestButton disabled={!canPrint} />
            <Button type="button" onClick={() => window.print()} disabled={!canPrint}>
              <Printer aria-hidden="true" />
              Stampa distinta bozza
            </Button>
          </div>
        </div>
      </div>

      {canPrint ? (
        <section className="request-draft-print print-only" aria-label="Distinta richiesta materiale bozza">
          <div className="mb-8 flex items-start justify-between border-b-2 border-brand-navy pb-4">
            <div>
              <p className="font-heading text-2xl font-bold text-brand-navy">FABTEK</p>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Richiesta Materiali</p>
            </div>
            <h1 className="text-right font-heading text-xl font-semibold text-slate-900">Distinta richiesta materiale — bozza</h1>
          </div>
          <RequestData
            requester={profile.full_name}
            previewDate={previewDate}
            project={draft.header.project}
            toolLine={draft.header.toolLine}
            utilities={draft.header.utilities}
            notes={draft.header.notes}
          />
          <div className="mt-7"><PrintTable lines={resolvedLines} /></div>
          <p className="mt-8 border-2 border-brand-copper px-4 py-3 text-center text-sm font-bold text-slate-900">
            Documento non ancora confermato al magazzino
          </p>
        </section>
      ) : null}
    </div>
  );
}
