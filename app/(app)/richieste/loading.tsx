import { PageHeading } from "@/components/shared/page-heading";

export default function RequestsPageLoading() {
  return (
    <div className="space-y-8">
      <PageHeading
        title="Le mie richieste"
        description="Consulta lo stato delle richieste inviate e la cronologia delle consegne."
      />
      <div className="space-y-4" aria-label="Caricamento richieste">
        <div className="h-5 w-28 animate-pulse rounded bg-muted/60" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60" />
      </div>
    </div>
  );
}
