import {
  DraftPrintView,
  type DraftLineDetails,
} from "@/components/requests/draft-print-view";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeading } from "@/components/shared/page-heading";
import {
  CatalogDataError,
  getCatalogVariantSelections,
} from "@/lib/data/catalog";
import { Suspense } from "react";

type SummarySearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lineValues(value: string | string[] | undefined) {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}

function parseLineSelections(value: string | string[] | undefined) {
  const selections: { itemVariantId: string; categoryId: string }[] = [];
  const variantIds = new Set<string>();

  for (const candidate of lineValues(value)) {
    const [itemVariantId, categoryId, ...rest] = candidate.split(":");
    if (
      rest.length > 0
      || !UUID_PATTERN.test(itemVariantId)
      || !UUID_PATTERN.test(categoryId)
      || variantIds.has(itemVariantId)
    ) {
      continue;
    }
    variantIds.add(itemVariantId);
    selections.push({ itemVariantId, categoryId });
  }

  return selections;
}

function SummaryLoading() {
  return <div className="h-96 animate-pulse rounded-xl border border-border bg-muted/60" aria-label="Caricamento riepilogo" />;
}

async function SummaryContent({ searchParams }: { searchParams: SummarySearchParams }) {
  const selections = parseLineSelections((await searchParams).line);

  try {
    const resolvedSelections = await getCatalogVariantSelections(selections);
    const details = resolvedSelections.flatMap<DraftLineDetails>((selection) => {
      const category = selection.variant.categories.find(
        (item) => item.id === selection.categoryId,
      );
      if (!category) return [];

      return [{
        itemVariantId: selection.itemVariantId,
        categoryId: selection.categoryId,
        partNumber: selection.variant.fabtekCode,
        category: category.name,
        family: selection.variant.family?.name ?? "",
        item: selection.variant.component?.name ?? selection.variant.description,
        size: selection.variant.diameter ?? "",
        material: selection.variant.material,
        connection: selection.variant.connection,
        stock: {
          trackInventory: selection.variant.stock.trackInventory,
          availableQuantity: selection.variant.stock.availableQuantity,
        },
      }];
    });
    const previewDate = new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Rome",
    }).format(new Date());

    return <DraftPrintView details={details} previewDate={previewDate} />;
  } catch (error) {
    if (error instanceof CatalogDataError) {
      return (
        <EmptyState
          title="Riepilogo non disponibile"
          description="Non è stato possibile verificare gli articoli della bozza. Riprova tra qualche minuto."
        />
      );
    }
    throw error;
  }
}

export default function RequestSummaryPage({ searchParams }: { searchParams: SummarySearchParams }) {
  return (
    <div className="space-y-8">
      <div className="screen-only">
        <PageHeading
          title="Riepilogo richiesta"
          description="Controlla intestazione e quantità, quindi stampa una distinta non ancora confermata."
        />
      </div>
      <Suspense fallback={<SummaryLoading />}>
        <SummaryContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
