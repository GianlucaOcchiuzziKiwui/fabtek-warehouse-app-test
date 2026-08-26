import { AvailabilityBadge } from "@/components/catalog/availability-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type {
  CatalogFilters,
  CatalogSearchResult,
  CatalogVariant,
} from "@/lib/data/catalog";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

const REQUEST_SELECT_STYLES = "h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

function filterParams(filters: CatalogFilters, page?: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.familyId) params.set("family", filters.familyId);
  if (filters.componentId) params.set("component", filters.componentId);
  if (page && page > 1) params.set("page", String(page));
  return params;
}

function displayTechnicalValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const values = value
      .map(displayTechnicalValue)
      .filter((item): item is string => Boolean(item));
    return values.length > 0 ? values.join(", ") : null;
  }
  return null;
}

function TechnicalDetails({ variant }: { variant: CatalogVariant }) {
  const details = [
    ["Diametro", variant.diameter],
    ["Materiale", variant.material],
    ["Connessione", variant.connection],
    ["Unità", variant.unitOfMeasure?.code],
    ...Object.entries(variant.technicalAttributes).map(([label, value]) => [
      label,
      displayTechnicalValue(value),
    ]),
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  if (details.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {details.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RequestCta({
  variant,
  selectedCategoryId,
}: {
  variant: CatalogVariant;
  selectedCategoryId?: string;
}) {
  if (variant.categories.length === 0) return null;

  const selectedCategory = variant.categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const fixedCategory = selectedCategory
    ?? (variant.categories.length === 1 ? variant.categories[0] : null);

  return (
    <form action="/richieste/nuova" method="get" className="flex flex-wrap gap-2">
      <input type="hidden" name="variantId" value={variant.id} />
      {fixedCategory ? (
        <input type="hidden" name="categoryId" value={fixedCategory.id} />
      ) : (
        <>
          <label htmlFor={`category-${variant.id}`} className="sr-only">
            Categoria della richiesta
          </label>
          <select
            id={`category-${variant.id}`}
            name="categoryId"
            required
            defaultValue=""
            className={REQUEST_SELECT_STYLES}
          >
            <option value="" disabled>Seleziona categoria</option>
            {variant.categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </>
      )}
      <Button type="submit" variant="accent">
        Richiedi questo articolo
      </Button>
    </form>
  );
}

function SupportingData({ variant }: { variant: CatalogVariant }) {
  if (!variant.supplier && !variant.datasheet) return null;

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {variant.supplier ? (
        <p>
          Fornitore: <span className="font-medium text-foreground">{variant.supplier.name}</span>
          {variant.supplier.partNumber ? ` · ${variant.supplier.partNumber}` : null}
        </p>
      ) : null}
      {variant.datasheet ? (
        <a
          href={variant.datasheet.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          {variant.datasheet.title ?? "Apri datasheet"}
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      ) : null}
    </div>
  );
}

function Pagination({
  result,
  filters,
}: {
  result: CatalogSearchResult;
  filters: CatalogFilters;
}) {
  const pageCount = Math.ceil(result.total / result.pageSize);
  if (pageCount <= 1) return null;

  const previousHref = `/catalogo?${filterParams(
    filters,
    Math.max(1, result.page - 1),
  )}`;
  const nextHref = `/catalogo?${filterParams(filters, result.page + 1)}`;

  return (
    <nav aria-label="Paginazione catalogo" className="flex items-center justify-between gap-4">
      {result.page <= 1 ? (
        <Button variant="outline" disabled>Precedente</Button>
      ) : (
        <Button asChild variant="outline">
          <Link href={previousHref}>Precedente</Link>
        </Button>
      )}
      <span className="text-sm text-muted-foreground">
        Pagina {result.page} di {pageCount}
      </span>
      {result.page >= pageCount ? (
        <Button variant="outline" disabled>Successiva</Button>
      ) : (
        <Button asChild variant="outline">
          <Link href={nextHref}>Successiva</Link>
        </Button>
      )}
    </nav>
  );
}

export function CatalogResults({
  result,
  filters,
}: {
  result: CatalogSearchResult;
  filters: CatalogFilters;
}) {
  const hasFilters = Boolean(
    filters.query
      || filters.categoryId
      || filters.familyId
      || filters.componentId,
  );

  if (result.items.length === 0) {
    return hasFilters || result.total > 0 ? (
      <EmptyState
        title="Nessun articolo trovato"
        description="Modifica o azzera i filtri per ampliare la ricerca."
        action={<Button asChild variant="outline"><Link href="/catalogo">Azzera filtri</Link></Button>}
      />
    ) : (
      <EmptyState
        title="Catalogo vuoto"
        description="Non sono ancora presenti varianti attive e selezionabili nel catalogo."
      />
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {result.total} {result.total === 1 ? "articolo trovato" : "articoli trovati"}
      </p>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="w-[18%] px-4 py-3">Codici</th>
              <th scope="col" className="w-[31%] px-4 py-3">Articolo</th>
              <th scope="col" className="w-[24%] px-4 py-3">Dati tecnici</th>
              <th scope="col" className="w-[27%] px-4 py-3">Disponibilità</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.items.map((variant) => (
              <tr key={variant.id} className="align-top">
                <td className="px-4 py-4">
                  <p className="font-semibold text-foreground">{variant.fabtekCode}</p>
                  {variant.oracleSapioCode ? (
                    <p className="mt-1 text-xs text-muted-foreground">Oracle/Sapio {variant.oracleSapioCode}</p>
                  ) : null}
                </td>
                <td className="space-y-2 px-4 py-4">
                  <p className="font-medium text-foreground">{variant.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {[variant.family?.name, variant.component?.name].filter(Boolean).join(" · ")}
                  </p>
                  <SupportingData variant={variant} />
                </td>
                <td className="px-4 py-4"><TechnicalDetails variant={variant} /></td>
                <td className="space-y-3 px-4 py-4">
                  <AvailabilityBadge stock={variant.stock} />
                  <RequestCta variant={variant} selectedCategoryId={filters.categoryId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:hidden">
        {result.items.map((variant) => (
          <article key={variant.id} className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{variant.fabtekCode}</p>
              <h2 className="mt-1 font-heading text-lg font-semibold">{variant.description}</h2>
              {variant.oracleSapioCode ? (
                <p className="mt-1 text-xs text-muted-foreground">Oracle/Sapio {variant.oracleSapioCode}</p>
              ) : null}
            </div>
            <TechnicalDetails variant={variant} />
            <SupportingData variant={variant} />
            <AvailabilityBadge stock={variant.stock} />
            <RequestCta variant={variant} selectedCategoryId={filters.categoryId} />
          </article>
        ))}
      </div>

      <Pagination result={result} filters={filters} />
    </div>
  );
}
