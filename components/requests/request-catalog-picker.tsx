import { AvailabilityBadge } from "@/components/catalog/availability-badge";
import { CatalogNavigation } from "@/components/catalog/catalog-navigation";
import { RequestItemRowControls } from "@/components/requests/add-to-request-button";
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

function RequestItemTable({
  variants,
  selectedCategoryId,
}: {
  variants: CatalogVariant[];
  selectedCategoryId?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table data-request-item-table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-brand-navy text-white">
          <tr>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Part #</th>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Misura</th>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Materiale</th>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Connessione</th>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Disponibilità</th>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Quantità</th>
            <th scope="col" className="px-3 py-2.5"><span className="sr-only">Azioni</span></th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <tr key={`${variant.id}:${selectedCategoryId ?? "all"}`} className="border-b border-border last:border-b-0 even:bg-muted/45">
              <td className="px-3 py-3 align-top font-mono font-semibold" title={variant.description}>{variant.fabtekCode}</td>
              <td className="px-3 py-3 align-top">{variant.diameter || "—"}</td>
              <td className="px-3 py-3 align-top">{variant.material || "—"}</td>
              <td className="px-3 py-3 align-top">{variant.connection || "—"}</td>
              <td className="px-3 py-3 align-top"><AvailabilityBadge stock={variant.stock} /></td>
              <RequestItemRowControls
                itemVariantId={variant.id}
                categories={variant.categories}
                selectedCategoryId={selectedCategoryId}
                stock={{
                  trackInventory: variant.stock.trackInventory,
                  availableQuantity: variant.stock.availableQuantity,
                }}
                datasheetUrl={variant.datasheet?.url ?? null}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
            <RequestItemTable
              variants={[selectedVariant]}
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
            {resultItems.length > 0 ? (
              <RequestItemTable variants={resultItems} selectedCategoryId={filters.categoryId} />
            ) : null}
            <RequestPagination result={result} filters={filters} />
          </div>
        )}
      </CatalogNavigation>
    </section>
  );
}
