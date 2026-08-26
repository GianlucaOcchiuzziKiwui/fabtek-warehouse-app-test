export default function NewRequestLoading() {
  return (
    <div className="space-y-7" aria-label="Caricamento nuova richiesta">
      <div className="space-y-3">
        <div className="h-9 w-72 max-w-full animate-pulse rounded-lg bg-muted/60" />
        <div className="h-5 w-full max-w-2xl animate-pulse rounded bg-muted/60" />
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/60" />
      <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60" />
    </div>
  );
}
