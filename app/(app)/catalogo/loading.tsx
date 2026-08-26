import { PageHeading } from "@/components/shared/page-heading";

export default function CatalogPageLoading() {
  return (
    <div className="space-y-8">
      <PageHeading
        title="Catalogo materiali"
        description="Cerca per codice o descrizione, oppure restringi il catalogo per categoria, famiglia e componente."
      />
      <div className="space-y-6" aria-label="Caricamento catalogo">
        <div className="h-52 animate-pulse rounded-xl border border-border bg-muted/60" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60" />
      </div>
    </div>
  );
}
