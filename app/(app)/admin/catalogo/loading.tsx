import { PageHeading } from "@/components/shared/page-heading";

export default function AdminCatalogLoading() {
  return (
    <div className="space-y-8">
      <PageHeading
        title="Gestisci catalogo"
        description="Cerca e organizza categorie, famiglie, componenti e varianti."
      />
      <div className="space-y-4" aria-label="Caricamento gestione catalogo">
        <div className="h-20 animate-pulse rounded-xl border border-border bg-muted/60" />
        <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/60" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60" />
      </div>
    </div>
  );
}
