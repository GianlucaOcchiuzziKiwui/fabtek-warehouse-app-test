import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { FulfillmentForm } from "@/components/admin/fulfillment-form";
import type {
  FulfillmentHistoryItem,
  RequestDetail as RequestDetailData,
  RequestLineDetail,
} from "@/lib/data/requests";
import { CheckCircle2, Clock3 } from "lucide-react";

function QuantitySummary({ line }: { line: RequestLineDetail }) {
  const values = [
    ["Richiesta", line.requestedQuantity],
    ["Evasa", line.fulfilledQuantity],
    ["Residua", line.remainingQuantity],
  ] as const;

  return (
    <dl className="grid grid-cols-3 gap-2">
      {values.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-muted/70 px-3 py-2 text-center">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-lg font-semibold text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FulfillmentItem({ item }: { item: FulfillmentHistoryItem }) {
  return (
    <li className="relative grid gap-1 pl-7 before:absolute before:left-[7px] before:top-5 before:h-[calc(100%-0.5rem)] before:w-px before:bg-border last:before:hidden">
      <CheckCircle2 aria-hidden="true" className="absolute left-0 top-0.5 size-4 text-status-good" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-foreground">
          {item.quantity} {item.quantity === 1 ? "unità consegnata" : "unità consegnate"}
        </span>
        <time dateTime={item.fulfilledAt} className="text-xs text-muted-foreground">
          {item.fulfilledAtLabel}
        </time>
      </div>
      {item.notes ? <p className="text-sm text-muted-foreground">{item.notes}</p> : null}
    </li>
  );
}

function RequestLine({
  requestId,
  line,
  canManage,
}: {
  requestId: string;
  line: RequestLineDetail;
  canManage: boolean;
}) {
  const technicalDetails = [
    ["Categoria", line.categoryName],
    ["Famiglia", line.familyName],
    ["Componente", line.componentName],
    ["Diametro", line.diameter],
    ["Materiale", line.material],
    ["Connessione", line.connection],
    ["Unità", line.unitOfMeasure],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {line.fabtekCode}
            {line.oracleSapioCode ? ` · Oracle/Sapio ${line.oracleSapioCode}` : null}
          </p>
          <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">
            {line.description}
          </h2>
        </div>
        <RequestStatusBadge status={line.status} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {technicalDetails.map(([label, value]) => (
            <div key={label} className="border-b border-border/70 pb-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <QuantitySummary line={line} />
      </div>

      <section className="mt-6 border-t border-border pt-5" aria-labelledby={`history-${line.id}`}>
        <h3 id={`history-${line.id}`} className="font-heading text-base font-semibold text-foreground">
          Cronologia consegne
        </h3>
        {line.fulfillments.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-4" />
            Nessuna consegna registrata.
          </p>
        ) : (
          <ol className="mt-4 space-y-4">
            {line.fulfillments.map((item) => <FulfillmentItem key={item.id} item={item} />)}
          </ol>
        )}
      </section>

      {canManage && line.remainingQuantity > 0 ? (
        <FulfillmentForm
          requestId={requestId}
          requestLineId={line.id}
          remainingQuantity={line.remainingQuantity}
        />
      ) : null}
    </article>
  );
}

export function RequestDetail({
  request,
  created = false,
  canManage = false,
}: {
  request: RequestDetailData;
  created?: boolean;
  canManage?: boolean;
}) {
  return (
    <div className="space-y-6">
      {created ? (
        <div role="status" className="flex gap-3 rounded-xl border border-status-good/25 bg-status-good-background px-4 py-3 text-sm text-status-good">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Richiesta inviata correttamente.</p>
            <p className="mt-0.5">Il progressivo assegnato è #{request.requestNumber}.</p>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="request-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Richiesta</p>
            <h2 id="request-heading" className="mt-1 font-heading text-3xl font-bold tracking-tight text-foreground">
              #{request.requestNumber}
            </h2>
            <time dateTime={request.requestedAt} className="mt-2 block text-sm text-muted-foreground">
              {request.requestedAtLabel}
            </time>
          </div>
          <RequestStatusBadge status={request.status} />
        </div>

        <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Progetto #</dt>
            <dd className="mt-1 font-medium">{request.project}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tool / Line #</dt>
            <dd className="mt-1 font-medium">{request.toolLine}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Utilities</dt>
            <dd className="mt-1 font-medium">{request.utilities}</dd>
          </div>
          {request.notes ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-xs text-muted-foreground">Note</dt>
              <dd className="mt-1 whitespace-pre-wrap">{request.notes}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="request-lines-heading" className="space-y-4">
        <div>
          <h2 id="request-lines-heading" className="font-heading text-2xl font-semibold text-foreground">
            Materiali richiesti
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {request.lines.length} {request.lines.length === 1 ? "riga" : "righe"}
          </p>
        </div>
        {request.lines.map((line) => (
          <RequestLine
            key={line.id}
            requestId={request.id}
            line={line}
            canManage={canManage}
          />
        ))}
      </section>
    </div>
  );
}
