import { RequestDetail } from "@/components/requests/request-detail";
import { PageHeading } from "@/components/shared/page-heading";
import { getRequestDetail } from "@/lib/data/requests";
import { requireCurrentProfile } from "@/lib/auth/current-profile";
import { isAdmin } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type RequestParams = Promise<{ requestId: string }>;
type RequestSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function RequestDetailLoading() {
  return (
    <div className="space-y-5" aria-label="Caricamento dettaglio richiesta">
      <div className="h-52 animate-pulse rounded-xl border border-border bg-muted/60" />
      <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/60" />
    </div>
  );
}

async function RequestDetailContent({
  params,
  searchParams,
}: {
  params: RequestParams;
  searchParams: RequestSearchParams;
}) {
  const [{ requestId }, query] = await Promise.all([params, searchParams]);
  const [request, profile] = await Promise.all([
    getRequestDetail(requestId),
    requireCurrentProfile(),
  ]);
  if (!request) notFound();

  return (
    <RequestDetail
      request={request}
      created={firstValue(query.created) === "1"}
      canManage={isAdmin(profile)}
    />
  );
}

export default function RequestDetailPage({
  params,
  searchParams,
}: {
  params: RequestParams;
  searchParams: RequestSearchParams;
}) {
  return (
    <div className="space-y-8">
      <PageHeading
        title="Dettaglio richiesta"
        description="Dati confermati, quantitÃ  e cronologia delle consegne."
      />
      <Suspense fallback={<RequestDetailLoading />}>
        <RequestDetailContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
