import { CatalogFiltersForm } from "@/components/catalog/catalog-filters";
import { CatalogResults } from "@/components/catalog/catalog-results";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeading } from "@/components/shared/page-heading";
import {
  CatalogDataError,
  getCatalogFilters,
  searchCatalog,
  type CatalogFilters,
} from "@/lib/data/catalog";
import { canonicalizeCatalogFilters } from "@/lib/data/catalog-mappers";
import { Suspense } from "react";

type CatalogSearchParams = Promise<Record<string, string | string[] | undefined>>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function filtersFromSearchParams(
  params: Awaited<CatalogSearchParams>,
): CatalogFilters {
  const id = (value: string | string[] | undefined) => {
    const candidate = firstValue(value)?.trim();
    return candidate && UUID_PATTERN.test(candidate) ? candidate : undefined;
  };
  const pageValue = Number(firstValue(params.page));
  return {
    query: firstValue(params.q)?.trim().slice(0, 120),
    categoryId: id(params.category),
    familyId: id(params.family),
    componentId: id(params.component),
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

function CatalogLoading() {
  return (
    <div className="space-y-6" aria-label="Caricamento catalogo">
      <div className="h-52 animate-pulse rounded-xl border border-border bg-muted/60" />
      <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60" />
    </div>
  );
}

async function CatalogContent({ searchParams }: { searchParams: CatalogSearchParams }) {
  const filters = filtersFromSearchParams(await searchParams);

  try {
    const options = await getCatalogFilters(filters);
    const canonicalFilters = canonicalizeCatalogFilters(filters, options);
    const result = await searchCatalog(canonicalFilters);

    return (
      <div className="space-y-7">
        <CatalogFiltersForm filters={canonicalFilters} options={options} />
        <CatalogResults result={result} filters={canonicalFilters} />
      </div>
    );
  } catch (error) {
    if (error instanceof CatalogDataError) {
      return (
        <EmptyState
          title="Catalogo non disponibile"
          description="Non è stato possibile caricare gli articoli. Riprova tra qualche minuto."
        />
      );
    }
    throw error;
  }
}

export default function CatalogPage({ searchParams }: { searchParams: CatalogSearchParams }) {
  return (
    <div className="space-y-8">
      <PageHeading
        title="Catalogo materiali"
        description="Cerca per codice o descrizione, oppure restringi il catalogo per categoria, famiglia e componente."
      />
      <Suspense fallback={<CatalogLoading />}>
        <CatalogContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
