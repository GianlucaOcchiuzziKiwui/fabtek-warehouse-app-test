import { WholeRequestFulfillmentButton } from "@/components/admin/whole-request-fulfillment-button";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeading } from "@/components/shared/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listManagedRequests,
  RequestDataError,
  type ManagedRequestListFilters,
  type ManagedRequestListResult,
} from "@/lib/data/requests";
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

type RequestSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(page: number, filters: ManagedRequestListFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/richieste?${query}` : "/admin/richieste";
}

function Pagination({
  result,
  filters,
}: {
  result: ManagedRequestListResult;
  filters: ManagedRequestListFilters;
}) {
  const pageCount = Math.ceil(result.total / result.pageSize);
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Paginazione richieste amministrative" className="flex items-center justify-between gap-4">
      {result.page <= 1 ? (
        <Button variant="outline" className="min-h-10" disabled>Precedente</Button>
      ) : (
        <Button asChild variant="outline" className="min-h-10">
          <Link href={pageHref(result.page - 1, filters)}>Precedente</Link>
        </Button>
      )}
      <span className="text-sm text-muted-foreground">Pagina {result.page} di {pageCount}</span>
      {result.page >= pageCount ? (
        <Button variant="outline" className="min-h-10" disabled>Successiva</Button>
      ) : (
        <Button asChild variant="outline" className="min-h-10">
          <Link href={pageHref(result.page + 1, filters)}>Successiva</Link>
        </Button>
      )}
    </nav>
  );
}

function ManagedRequestList({
  result,
  filters,
}: {
  result: ManagedRequestListResult;
  filters: ManagedRequestListFilters;
}) {
  if (result.items.length === 0) {
    return (
      <EmptyState
        title="Nessuna richiesta trovata"
        description="Modifica i filtri oppure attendi l'invio di una nuova richiesta."
      />
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {result.total} {result.total === 1 ? "richiesta" : "richieste"}
      </p>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3">Richiesta</th>
              <th scope="col" className="px-4 py-3">Richiedente</th>
              <th scope="col" className="px-4 py-3">Data</th>
              <th scope="col" className="px-4 py-3">Progetto</th>
              <th scope="col" className="px-4 py-3">Righe</th>
              <th scope="col" className="px-4 py-3">Stato</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Apri</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.items.map((request) => (
              <tr key={request.id}>
                <td className="px-4 py-4 font-semibold text-foreground">#{request.requestNumber}</td>
                <td className="px-4 py-4">{request.requesterName}</td>
                <td className="px-4 py-4 text-muted-foreground">{request.requestedAtLabel}</td>
                <td className="px-4 py-4">{request.project}</td>
                <td className="px-4 py-4">{request.lineCount}</td>
                <td className="px-4 py-4"><RequestStatusBadge status={request.status} /></td>
                <td className="px-4 py-4">
                  <div className="flex items-start justify-end gap-2">
                    {request.status.tone !== "good" ? (
                      <WholeRequestFulfillmentButton
                        requestId={request.id}
                        ariaLabel={`Evadi completamente richiesta ${request.requestNumber}`}
                      />
                    ) : null}
                    <Button asChild variant="ghost" className="min-h-10">
                      <Link href={`/richieste/${request.id}`} aria-label={`Apri richiesta ${request.requestNumber}`}>
                        Dettaglio
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:hidden">
        {result.items.map((request) => (
          <article key={request.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Richiesta #{request.requestNumber}
                </p>
                <h2 className="mt-1 font-heading text-lg font-semibold">{request.project}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{request.requesterName}</p>
              </div>
              <RequestStatusBadge status={request.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Data</dt><dd className="mt-1">{request.requestedAtLabel}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Righe</dt><dd className="mt-1">{request.lineCount}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap items-start gap-2">
              {request.status.tone !== "good" ? (
                <WholeRequestFulfillmentButton
                  requestId={request.id}
                  ariaLabel={`Evadi completamente richiesta ${request.requestNumber}`}
                />
              ) : null}
              <Button asChild variant="outline" className="min-h-10 flex-1">
                <Link href={`/richieste/${request.id}`}>Apri dettaglio <ArrowRight aria-hidden="true" /></Link>
              </Button>
            </div>
          </article>
        ))}
      </div>

      <Pagination result={result} filters={filters} />
    </div>
  );
}

function ManagedRequestsLoading() {
  return (
    <div className="space-y-4" aria-label="Caricamento richieste amministrative">
      <div className="h-24 animate-pulse rounded-xl border border-border bg-muted/60" />
      <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60" />
    </div>
  );
}

async function ManagedRequestsContent({ searchParams }: { searchParams: RequestSearchParams }) {
  const query = await searchParams;
  const pageValue = Number(firstValue(query.page));
  const filters = {
    query: firstValue(query.q) ?? "",
    status: firstValue(query.status) ?? "",
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };

  try {
    const result = await listManagedRequests(filters);
    return (
      <div className="space-y-6">
        <form action="/admin/richieste" method="get" className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="managed-request-query">Cerca</Label>
            <Input id="managed-request-query" name="q" maxLength={120} defaultValue={filters.query} placeholder="Progetto, tool/line o utilities" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="managed-request-status">Stato</Label>
            <select id="managed-request-status" name="status" defaultValue={filters.status} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25">
              <option value="">Tutti gli stati</option>
              <option value="in_preparazione">In preparazione</option>
              <option value="evasa_parziale">Evasa parzialmente</option>
              <option value="evasa">Evasa</option>
            </select>
          </div>
          <Button type="submit"><Search aria-hidden="true" />Filtra</Button>
        </form>
        <ManagedRequestList result={result} filters={filters} />
      </div>
    );
  } catch (error) {
    if (error instanceof RequestDataError) {
      return <EmptyState title="Richieste non disponibili" description="Non è stato possibile caricare le richieste. Riprova tra qualche minuto." />;
    }
    throw error;
  }
}

export default function ManagedRequestsPage({ searchParams }: { searchParams: RequestSearchParams }) {
  return (
    <div className="space-y-8">
      <PageHeading title="Gestisci richieste" description="Filtra le richieste ricevute e apri il dettaglio per registrare una consegna." />
      <Suspense fallback={<ManagedRequestsLoading />}>
        <ManagedRequestsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
