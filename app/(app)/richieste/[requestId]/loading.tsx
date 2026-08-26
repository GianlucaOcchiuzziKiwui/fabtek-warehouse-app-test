import { PageHeading } from "@/components/shared/page-heading";

export default function RequestDetailPageLoading() {
  return (
    <div className="space-y-8">
      <PageHeading
        title="Dettaglio richiesta"
        description="Dati confermati, quantitÃ  e cronologia delle consegne."
      />
      <div className="space-y-5" aria-label="Caricamento dettaglio richiesta">
        <div className="h-52 animate-pulse rounded-xl border border-border bg-muted/60" />
        <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/60" />
      </div>
    </div>
  );
}
