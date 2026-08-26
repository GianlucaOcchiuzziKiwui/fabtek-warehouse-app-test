import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { RequestListResult } from "@/lib/data/requests";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";

function pageHref(page: number) {
  return page > 1 ? `/richieste?page=${page}` : "/richieste";
}

function Pagination({ result }: { result: RequestListResult }) {
  const pageCount = Math.ceil(result.total / result.pageSize);
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Paginazione richieste" className="flex items-center justify-between gap-4">
      {result.page <= 1 ? (
        <Button variant="outline" className="min-h-10" disabled>Precedente</Button>
      ) : (
        <Button asChild variant="outline" className="min-h-10">
          <Link href={pageHref(result.page - 1)}>Precedente</Link>
        </Button>
      )}
      <span className="text-sm text-muted-foreground">
        Pagina {result.page} di {pageCount}
      </span>
      {result.page >= pageCount ? (
        <Button variant="outline" className="min-h-10" disabled>Successiva</Button>
      ) : (
        <Button asChild variant="outline" className="min-h-10">
          <Link href={pageHref(result.page + 1)}>Successiva</Link>
        </Button>
      )}
    </nav>
  );
}

export function RequestList({ result }: { result: RequestListResult }) {
  if (result.items.length === 0) {
    return (
      <EmptyState
        title="Nessuna richiesta"
        description="Le richieste inviate compariranno qui con il loro stato aggiornato."
        action={(
          <Button asChild>
            <Link href="/richieste/nuova">
              <Plus aria-hidden="true" />
              Crea richiesta
            </Link>
          </Button>
        )}
      />
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {result.total} {result.total === 1 ? "richiesta" : "richieste"}
      </p>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3">Richiesta</th>
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
                <td className="px-4 py-4 text-muted-foreground">{request.requestedAtLabel}</td>
                <td className="px-4 py-4">{request.project}</td>
                <td className="px-4 py-4">{request.lineCount}</td>
                <td className="px-4 py-4"><RequestStatusBadge status={request.status} /></td>
                <td className="px-4 py-4 text-right">
                  <Button asChild variant="ghost" className="min-h-10">
                    <Link href={`/richieste/${request.id}`} aria-label={`Apri richiesta ${request.requestNumber}`}>
                      Dettaglio
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:hidden">
        {result.items.map((request) => (
          <article key={request.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Richiesta #{request.requestNumber}
                </p>
                <h2 className="mt-1 font-heading text-lg font-semibold">{request.project}</h2>
              </div>
              <RequestStatusBadge status={request.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Data</dt>
                <dd className="mt-1">{request.requestedAtLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Righe</dt>
                <dd className="mt-1">{request.lineCount}</dd>
              </div>
            </dl>
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link href={`/richieste/${request.id}`}>
                Apri dettaglio
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </article>
        ))}
      </div>

      <Pagination result={result} />
    </div>
  );
}
