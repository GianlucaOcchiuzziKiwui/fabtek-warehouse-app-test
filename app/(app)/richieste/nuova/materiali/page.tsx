import { CartSummary } from "@/components/requests/cart-summary";
import { RequestCatalogPicker } from "@/components/requests/request-catalog-picker";
import { RequestMaterialsGate } from "@/components/requests/request-header-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeading } from "@/components/shared/page-heading";
import { Button } from "@/components/ui/button";
import {
  CatalogDataError,
  getCatalogFilters,
  getCatalogVariantSelection,
  searchCatalog,
  searchCatalogNavigation,
  type CatalogFilters,
} from "@/lib/data/catalog";
import {
  canonicalizeCatalogFilters,
  resolveCatalogNavigationStep,
} from "@/lib/data/catalog-mappers";
import { buildRequestHeaderHref } from "@/lib/domain/requests/navigation";
import { PencilLine } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

type RequestSearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function uuid(value: string | string[] | undefined) {
  const candidate = firstValue(value)?.trim();
  return candidate && UUID_PATTERN.test(candidate) ? candidate : undefined;
}

function filtersFromSearchParams(params: Awaited<RequestSearchParams>): CatalogFilters {
  const pageValue = Number(firstValue(params.page));
  return {
    query: firstValue(params.q)?.trim().slice(0, 120),
    categoryId: uuid(params.category) ?? uuid(params.categoryId),
    familyId: uuid(params.family),
    componentId: uuid(params.component),
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

function RequestCatalogLoading() {
  return (
    <div className="space-y-5" aria-label="Caricamento selezione materiali">
      <div className="h-16 w-72 animate-pulse rounded-lg bg-muted/60" />
      <div className="h-52 animate-pulse rounded-xl border border-border bg-muted/60" />
      <div className="h-56 animate-pulse rounded-xl border border-border bg-muted/60" />
    </div>
  );
}

async function RequestCatalogContent({
  params,
}: {
  params: Awaited<RequestSearchParams>;
}) {
  const filters = filtersFromSearchParams(params);
  const variantId = uuid(params.variantId) ?? uuid(params.requestVariant);
  const selectedCategoryId = uuid(params.categoryId) ?? uuid(params.category);
  const selectionRequested = Boolean(
    firstValue(params.variantId)
    || firstValue(params.requestVariant)
    || firstValue(params.categoryId),
  );

  try {
    const [options, selectedVariant, searchMatches] = await Promise.all([
      getCatalogFilters(filters),
      variantId && selectedCategoryId
        ? getCatalogVariantSelection(variantId, selectedCategoryId)
        : Promise.resolve(null),
      filters.query ? searchCatalogNavigation(filters.query) : Promise.resolve([]),
    ]);
    const canonicalFilters = canonicalizeCatalogFilters(filters, options);
    const result = resolveCatalogNavigationStep(canonicalFilters) === "items"
      ? await searchCatalog(canonicalFilters)
      : { items: [], page: 1, pageSize: 24, total: 0 };

    return (
      <RequestCatalogPicker
        filters={canonicalFilters}
        options={options}
        searchMatches={searchMatches}
        result={result}
        selectedVariant={selectedVariant}
        selectedCategoryId={selectedCategoryId}
        selectionRequested={selectionRequested}
      />
    );
  } catch (error) {
    if (error instanceof CatalogDataError) {
      return (
        <EmptyState
          title="Catalogo non disponibile"
          description="Non è stato possibile caricare gli articoli. La bozza già compilata resta salvata in questa sessione."
        />
      );
    }
    throw error;
  }
}

export default async function RequestMaterialsPage({ searchParams }: { searchParams: RequestSearchParams }) {
  const params = await searchParams;
  const editHeaderHref = buildRequestHeaderHref({
    variantId: firstValue(params.variantId) ?? firstValue(params.requestVariant),
    categoryId: firstValue(params.categoryId) ?? firstValue(params.category),
  });

  return (
    <div className="space-y-8 pb-24 lg:pb-3">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <PageHeading
          title="Scegli i prodotti"
          description="Cerca un prodotto oppure naviga Categoria → Famiglia → Componente → Item."
        />
        <Button asChild variant="outline" className="shrink-0">
          <Link href={editHeaderHref}><PencilLine aria-hidden="true" />Modifica dati richiesta</Link>
        </Button>
      </div>
      <RequestMaterialsGate>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Suspense fallback={<RequestCatalogLoading />}>
            <RequestCatalogContent params={params} />
          </Suspense>
          <CartSummary />
        </div>
      </RequestMaterialsGate>
    </div>
  );
}
