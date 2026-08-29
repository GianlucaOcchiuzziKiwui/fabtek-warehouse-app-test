import { PageHeading } from "@/components/shared/page-heading";

export default function AdminCatalogLoading() {
  return (
    <div className="space-y-8">
      <PageHeading
        title="Gestisci catalogo"
        description="Cerca e organizza categorie, famiglie, componenti e varianti."
      />
      <div className="space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Caricamento gestione catalogo in corso.</span>
        <div className="h-20 animate-pulse rounded-xl border border-border bg-muted/60 motion-reduce:animate-none" />
        <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/60 motion-reduce:animate-none" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
