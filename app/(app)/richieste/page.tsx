import { RequestList } from "@/components/requests/request-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeading } from "@/components/shared/page-heading";
import {
  listOwnRequests,
  RequestDataError,
} from "@/lib/data/requests";
import { Suspense } from "react";

type RequestSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function RequestsLoading() {
  return (
    <div className="space-y-4" aria-label="Caricamento richieste">
      <div className="h-5 w-28 animate-pulse rounded bg-muted/60" />
      <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60" />
    </div>
  );
}

async function RequestsContent({ searchParams }: { searchParams: RequestSearchParams }) {
  const pageValue = Number(firstValue((await searchParams).page));
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;

  try {
    return <RequestList result={await listOwnRequests({ page })} />;
  } catch (error) {
    if (error instanceof RequestDataError) {
      return (
        <EmptyState
          title="Richieste non disponibili"
          description="Non Ã¨ stato possibile caricare lo storico. Riprova tra qualche minuto."
        />
      );
    }
    throw error;
  }
}

export default function RequestsPage({ searchParams }: { searchParams: RequestSearchParams }) {
  return (
    <div className="space-y-8">
      <PageHeading
        title="Le mie richieste"
        description="Consulta lo stato delle richieste inviate e la cronologia delle consegne."
      />
      <Suspense fallback={<RequestsLoading />}>
        <RequestsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
