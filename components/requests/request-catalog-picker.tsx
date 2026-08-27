import { AvailabilityBadge } from "@/components/catalog/availability-badge";
import { CatalogNavigation } from "@/components/catalog/catalog-navigation";
import { AddToRequestButton } from "@/components/requests/add-to-request-button";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
  CatalogFilterOptions,
  CatalogFilters,
  CatalogNavigationMatch,
  CatalogSearchResult,
  CatalogVariant,
} from "@/lib/data/catalog";
import { REQUEST_MATERIALS_PATH } from "@/lib/domain/requests/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck } from "lucide-react";
import Link from "next/link";

function requestFilterParams(filters: CatalogFilters, page?: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.familyId) params.set("family", filters.familyId);
  if (filters.componentId) params.set("component", filters.componentId);
  if (page && page > 1) params.set("page", String(page));
  return params;
}

function VariantDetails({
  variant,
  selectedCategoryId,
}: {
  variant: CatalogVariant;
  selectedCategoryId?: string;
}) {
  return (
    <article className="grid gap-5 rounded-xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)] lg:p-5">
      <div className="min-w-0 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{variant.fabtekCode}</p>
          <h3 className="mt-1 font-heading text-lg font-semibold">{variant.description}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {[variant.family?.name, variant.component?.name].filter(Boolean).join(" · ") || "Articolo catalogo"}
          </p>
        </div>
        <dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Misura</dt>
            <dd className="font-medium">{variant.diameter || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Materiale</dt>
            <dd className="font-medium">{variant.material || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Connessione</dt>
            <dd className="font-medium">{variant.connection || "—"}</dd>
          </div>
        </dl>
      </div>
      <div className="space-y-4 lg:border-l lg:border-border lg:pl-5">
        <AvailabilityBadge stock={variant.stock} />
        <AddToRequestButton
          itemVariantId={variant.id}
          categories={variant.categories}
          selectedCategoryId={selectedCategoryId}
          stock={{
            trackInventory: variant.stock.trackInventory,
            availableQuantity: variant.stock.availableQuantity,
          }}
        />
      </div>
    </article>
  );
}

function RequestPagination({
  result,
  filters,
}: {
  result: CatalogSearchResult;
  filters: CatalogFilters;
}) {
  const pageCount = Math.ceil(result.total / result.pageSize);
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Paginazione selezione materiali" className="flex items-center justify-between gap-4">
      {result.page <= 1 ? (
        <Button variant="outline" disabled><ArrowLeft aria-hidden="true" />Precedente</Button>
      ) : (
        <Button asChild variant="outline">
          <Link href={`${REQUEST_MATERIALS_PATH}?${requestFilterParams(filters, result.page - 1)}`}>
            <ArrowLeft aria-hidden="true" />Precedente
          </Link>
        </Button>
      )}
      <span className="text-sm text-muted-foreground">Pagina {result.page} di {pageCount}</span>
      {result.page >= pageCount ? (
        <Button variant="outline" disabled>Successiva<ArrowRight aria-hidden="true" /></Button>
      ) : (
        <Button asChild variant="outline">
          <Link href={`${REQUEST_MATERIALS_PATH}?${requestFilterParams(filters, result.page + 1)}`}>
            Successiva<ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </nav>
  );
}

export function RequestCatalogPicker({
  filters,
  options,
  searchMatches,
  result,
  selectedVariant,
  selectedCategoryId,
  selectionRequested,
}: {
  filters: CatalogFilters;
  options: CatalogFilterOptions;
  searchMatches: CatalogNavigationMatch[];
  result: CatalogSearchResult;
  selectedVariant: CatalogVariant | null;
  selectedCategoryId?: string;
  selectionRequested: boolean;
}) {
  const resultItems = selectedVariant
    ? result.items.filter((item) => item.id !== selectedVariant.id)
    : result.items;

  return (
    <section className="space-y-6" aria-labelledby="request-picker-title">
      <div>
        <p className="text-sm font-semibold text-primary">2. Materiali</p>
        <h2 id="request-picker-title" className="mt-1 font-heading text-2xl font-semibold tracking-tight">
          Selezione guidata
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Segui Categoria → Famiglia → Componente, poi indica la quantità della variante.
        </p>
      </div>

      {selectedVariant ? (
        <Card className="border-primary/35 bg-primary/[0.035]">
          <CardHeader>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <BadgeCheck aria-hidden="true" className="size-4" />
              Articolo selezionato dal catalogo
            </div>
            <h3 className="font-heading text-lg font-semibold">{selectedVariant.fabtekCode}</h3>
          </CardHeader>
          <CardContent>
            <VariantDetails
              key={`${selectedVariant.id}:${selectedCategoryId ?? "selected"}`}
              variant={selectedVariant}
              selectedCategoryId={selectedCategoryId}
            />
          </CardContent>
        </Card>
      ) : selectionRequested ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          L’articolo selezionato non è più disponibile per questa categoria. Puoi sceglierne un altro dal catalogo.
        </div>
      ) : null}

      <CatalogNavigation
        basePath={REQUEST_MATERIALS_PATH}
        filters={filters}
        options={options}
        searchMatches={searchMatches}
      >
        {result.items.length === 0 ? (
          <EmptyState
            title="Nessun item disponibile"
            description="Il componente selezionato non contiene item attivi per questa categoria."
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "item trovato" : "item trovati"}
            </p>
            {resultItems.map((variant) => (
              <VariantDetails
                key={`${variant.id}:${filters.categoryId ?? "all"}`}
                variant={variant}
                selectedCategoryId={filters.categoryId}
              />
            ))}
            <RequestPagination result={result} filters={filters} />
          </div>
        )}
      </CatalogNavigation>
    </section>
  );
}
