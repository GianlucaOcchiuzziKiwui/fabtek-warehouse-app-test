import { CartSummary } from "@/components/requests/cart-summary";
import { RequestCatalogPicker } from "@/components/requests/request-catalog-picker";
import {
  RequestHeaderForm,
  RequestSelectionGate,
} from "@/components/requests/request-header-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeading } from "@/components/shared/page-heading";
import {
  CatalogDataError,
  getCatalogFilters,
  getCatalogVariantSelection,
  searchCatalog,
  type CatalogFilters,
} from "@/lib/data/catalog";
import { canonicalizeCatalogFilters } from "@/lib/data/catalog-mappers";
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

async function RequestCatalogContent({ searchParams }: { searchParams: RequestSearchParams }) {
  const params = await searchParams;
  const filters = filtersFromSearchParams(params);
  const variantId = uuid(params.variantId) ?? uuid(params.requestVariant);
  const selectedCategoryId = uuid(params.categoryId) ?? uuid(params.category);
  const selectionRequested = Boolean(
    firstValue(params.variantId)
    || firstValue(params.requestVariant)
    || firstValue(params.categoryId),
  );

  try {
    const [options, selectedVariant] = await Promise.all([
      getCatalogFilters(filters),
      variantId && selectedCategoryId
        ? getCatalogVariantSelection(variantId, selectedCategoryId)
        : Promise.resolve(null),
    ]);
    const canonicalFilters = canonicalizeCatalogFilters(filters, options);
    const result = await searchCatalog(canonicalFilters);

    return (
      <RequestCatalogPicker
        filters={canonicalFilters}
        options={options}
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

export default function NewRequestPage({ searchParams }: { searchParams: RequestSearchParams }) {
  return (
    <div className="space-y-8 pb-24 lg:pb-3">
      <PageHeading
        title="Nuova richiesta materiale"
        description="Compila l’intestazione, scegli gli articoli e controlla la bozza prima della conferma."
      />
      <RequestHeaderForm />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <RequestSelectionGate>
          <Suspense fallback={<RequestCatalogLoading />}>
            <RequestCatalogContent searchParams={searchParams} />
          </Suspense>
        </RequestSelectionGate>
        <CartSummary />
      </div>
    </div>
  );
}
