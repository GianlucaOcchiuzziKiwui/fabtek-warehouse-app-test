import { PageHeading } from "@/components/shared/page-heading";

export default function ManagedRequestsPageLoading() {
  return (
    <div className="space-y-8">
      <PageHeading
        title="Gestisci richieste"
        description="Filtra le richieste ricevute e apri il dettaglio per registrare una consegna."
      />
      <div className="space-y-4" aria-label="Caricamento richieste amministrative">
        <div className="h-24 animate-pulse rounded-xl border border-border bg-muted/60" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60" />
      </div>
    </div>
  );
}
