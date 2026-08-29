import { CatalogIcon } from "@/components/catalog/catalog-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminCatalogListQuery, AdminCatalogTab } from "@/lib/domain/admin-catalog/contracts";
import type {
  AdminCatalogFormOptions,
  AdminCatalogPage,
  AdminCatalogRow,
} from "@/lib/data/admin-catalog";
import { Plus, RotateCcw, Search } from "lucide-react";
import Link from "next/link";

const TAB_CONTENT: Record<AdminCatalogTab, {
  label: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}> = {
  categorie: {
    label: "Categorie",
    title: "Categorie",
    description: "Organizza le varianti nei raggruppamenti mostrati nel catalogo.",
    emptyTitle: "Nessuna categoria trovata",
    emptyDescription: "Modifica i filtri oppure crea la prima categoria.",
  },
  famiglie: {
    label: "Famiglie",
    title: "Famiglie",
    description: "Gestisci i gruppi tecnici che raccolgono i componenti.",
    emptyTitle: "Nessuna famiglia trovata",
    emptyDescription: "Modifica i filtri oppure crea la prima famiglia.",
  },
  componenti: {
    label: "Componenti",
    title: "Componenti",
    description: "Gestisci i componenti disponibili all'interno delle famiglie.",
    emptyTitle: "Nessun componente trovato",
    emptyDescription: "Modifica i filtri oppure crea il primo componente.",
  },
  varianti: {
    label: "Varianti",
    title: "Varianti",
    description: "Consulta le varianti e le relazioni usate dal catalogo pubblico.",
    emptyTitle: "Nessuna variante trovata",
    emptyDescription: "Modifica i filtri oppure crea la prima variante.",
  },
};

const TABS = Object.keys(TAB_CONTENT) as AdminCatalogTab[];

export function buildAdminCatalogHref(
  query: AdminCatalogListQuery,
  overrides: Partial<AdminCatalogListQuery> = {},
) {
  const nextQuery = { ...query, ...overrides };
  const params = new URLSearchParams();
  params.set("tab", nextQuery.tab);
  if (nextQuery.query) params.set("q", nextQuery.query);
  params.set("status", nextQuery.status);
  params.set("page", String(nextQuery.page));
  return `/admin/catalogo?${params.toString()}`;
}

function CatalogStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "default" : "destructive"}>
      {isActive ? "Attivo" : "Inattivo"}
    </Badge>
  );
}

function ParentStatus({ label, isActive }: { label: string; isActive: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{label}</span>
      {!isActive ? <Badge variant="outline">Genitore inattivo</Badge> : null}
    </span>
  );
}

function RowPrimary({ item }: { item: AdminCatalogRow }) {
  if (item.kind === "categoria") {
    return (
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CatalogIcon iconKey={item.iconKey} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="break-words font-semibold text-foreground">{item.name}</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{item.code}</p>
        </div>
      </div>
    );
  }
  if (item.kind === "famiglia") {
    return (
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CatalogIcon iconKey={item.iconKey} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="break-words font-semibold text-foreground">{item.name}</p>
          {item.sourceCode ? (
            <p className="mt-1 break-all text-xs text-muted-foreground">{item.sourceCode}</p>
          ) : null}
        </div>
      </div>
    );
  }
  if (item.kind === "componente") {
    return (
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CatalogIcon iconKey={item.iconKey} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="break-words font-semibold text-foreground">{item.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <ParentStatus label={item.family.name} isActive={item.family.isActive} />
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="break-all font-semibold text-foreground">{item.fabtekCode}</p>
      {item.oracleSapioCode ? (
        <p className="mt-1 break-all text-xs text-muted-foreground">
          Oracle/SAPIO: {item.oracleSapioCode}
        </p>
      ) : null}
    </div>
  );
}

function RowDetails({ item }: { item: AdminCatalogRow }) {
  if (item.kind === "categoria" || item.kind === "famiglia") {
    return item.subtitle ? (
      <p className="break-words text-sm text-muted-foreground">{item.subtitle}</p>
    ) : (
      <span className="text-sm text-muted-foreground">—</span>
    );
  }
  if (item.kind === "componente") {
    return item.description ? (
      <p className="break-words text-sm text-muted-foreground">{item.description}</p>
    ) : (
      <span className="text-sm text-muted-foreground">—</span>
    );
  }
  return (
    <div className="space-y-1 text-sm">
      <p className="break-words text-foreground">{item.description}</p>
      <p className="break-words text-xs text-muted-foreground">
        {item.material} · {item.connection}
        {item.diameter ? ` · ${item.diameter}` : ""}
      </p>
      <p className="break-words text-xs text-muted-foreground">
        <ParentStatus
          label={`${item.component.family.name} / ${item.component.name}`}
          isActive={item.component.isActive && item.component.family.isActive}
        />
      </p>
      <p className="break-words text-xs text-muted-foreground">
        {item.categories.length > 0
          ? item.categories.map((category) => category.name).join(", ")
          : "Nessuna categoria"}
        {` · ${item.unitOfMeasure.code}`}
      </p>
    </div>
  );
}

function CatalogRows({ result }: { result: AdminCatalogPage }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {result.total} {result.total === 1 ? "voce" : "voci"}
      </p>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="w-[34%] px-4 py-3">Voce</th>
              <th scope="col" className="w-[42%] px-4 py-3">Dettagli</th>
              <th scope="col" className="w-[10%] px-4 py-3">Ordine</th>
              <th scope="col" className="w-[14%] px-4 py-3">Stato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.items.map((item) => (
              <tr key={item.id}>
                <th scope="row" className="px-4 py-4 align-top font-normal">
                  <RowPrimary item={item} />
                </th>
                <td className="px-4 py-4 align-top"><RowDetails item={item} /></td>
                <td className="px-4 py-4 align-top tabular-nums">{item.sortOrder}</td>
                <td className="px-4 py-4 align-top"><CatalogStatusBadge isActive={item.isActive} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:hidden">
        {result.items.map((item) => (
          <article key={item.id} className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <RowPrimary item={item} />
              <CatalogStatusBadge isActive={item.isActive} />
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <RowDetails item={item} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Ordine: {item.sortOrder}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function CatalogPagination({
  query,
  result,
}: {
  query: AdminCatalogListQuery;
  result: AdminCatalogPage;
}) {
  const pageCount = Math.ceil(result.total / result.pageSize);
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Paginazione catalogo amministrativo" className="flex flex-wrap items-center justify-between gap-4">
      {result.page <= 1 ? (
        <Button variant="outline" disabled>Precedente</Button>
      ) : (
        <Button asChild variant="outline">
          <Link href={buildAdminCatalogHref(query, { page: result.page - 1 })}>Precedente</Link>
        </Button>
      )}
      <span className="text-sm text-muted-foreground">Pagina {result.page} di {pageCount}</span>
      {result.page >= pageCount ? (
        <Button variant="outline" disabled>Successiva</Button>
      ) : (
        <Button asChild variant="outline">
          <Link href={buildAdminCatalogHref(query, { page: result.page + 1 })}>Successiva</Link>
        </Button>
      )}
    </nav>
  );
}

export function CatalogManagement({
  query,
  result,
  loadError = false,
}: {
  query: AdminCatalogListQuery;
  result: AdminCatalogPage | null;
  formOptions: AdminCatalogFormOptions;
  loadError?: boolean;
}) {
  const content = TAB_CONTENT[query.tab];

  return (
    <div className="space-y-6">
      <nav aria-label="Sezioni gestione catalogo" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TABS.map((tab) => {
          const active = tab === query.tab;
          return (
            <Button key={tab} asChild variant={active ? "default" : "outline"} className="w-full">
              <Link
                href={buildAdminCatalogHref(query, { tab })}
                aria-current={active ? "page" : undefined}
              >
                {TAB_CONTENT[tab].label}
              </Link>
            </Button>
          );
        })}
      </nav>

      <section aria-labelledby={`admin-catalog-${query.tab}-title`} className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h2 id={`admin-catalog-${query.tab}-title`} className="font-heading text-2xl font-semibold text-foreground">
              {content.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{content.description}</p>
          </div>
          <Button type="button" disabled title="La creazione sarà disponibile nel passaggio successivo">
            <Plus aria-hidden="true" />
            Nuovo
          </Button>
        </div>

        <form
          action="/admin/catalogo"
          method="get"
          className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
        >
          <input type="hidden" name="tab" value={query.tab} />
          <input type="hidden" name="page" value="1" />
          <div className="min-w-0 space-y-2">
            <Label htmlFor="admin-catalog-query">Cerca</Label>
            <Input
              id="admin-catalog-query"
              name="q"
              maxLength={120}
              defaultValue={query.query}
              placeholder="Codice, nome o descrizione"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-catalog-status">Stato</Label>
            <select
              id="admin-catalog-status"
              name="status"
              defaultValue={query.status}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            >
              <option value="attivi">Attivi</option>
              <option value="inattivi">Inattivi</option>
              <option value="tutti">Tutti</option>
            </select>
          </div>
          <Button type="submit"><Search aria-hidden="true" />Filtra</Button>
        </form>

        {loadError || !result ? (
          <EmptyState
            title="Catalogo non disponibile"
            description="Non è stato possibile caricare i dati. Riprova tra qualche minuto."
            action={(
              <Button asChild variant="outline">
                <Link href={buildAdminCatalogHref(query)}>
                  <RotateCcw aria-hidden="true" />
                  Riprova
                </Link>
              </Button>
            )}
          />
        ) : result.items.length === 0 ? (
          <EmptyState title={content.emptyTitle} description={content.emptyDescription} />
        ) : (
          <CatalogRows result={result} />
        )}

        {result ? <CatalogPagination query={query} result={result} /> : null}
      </section>
    </div>
  );
}
