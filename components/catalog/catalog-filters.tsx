import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CatalogFilterOptions,
  CatalogFilters,
} from "@/lib/data/catalog";
import Link from "next/link";
import { Search, X } from "lucide-react";

const SELECT_STYLES = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60";

export function CatalogFiltersForm({
  filters,
  options,
  action = "/catalogo",
  resetHref = "/catalogo",
}: {
  filters: CatalogFilters;
  options: CatalogFilterOptions;
  action?: string;
  resetHref?: string;
}) {
  const hasFilters = Boolean(
    filters.query
      || filters.categoryId
      || filters.familyId
      || filters.componentId,
  );

  return (
    <form
      action={action}
      method="get"
      className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm lg:grid-cols-4"
    >
      <div className="lg:col-span-4">
        <label htmlFor="catalog-query" className="mb-1.5 block text-sm font-medium">
          Cerca per codice o descrizione
        </label>
        <Input
          id="catalog-query"
          name="q"
          defaultValue={filters.query}
          maxLength={120}
          placeholder="Codice Fabtek, Oracle/Sapio o descrizione"
        />
      </div>

      <div>
        <label htmlFor="catalog-category" className="mb-1.5 block text-sm font-medium">
          Categoria
        </label>
        <select
          id="catalog-category"
          name="category"
          defaultValue={filters.categoryId ?? ""}
          className={SELECT_STYLES}
        >
          <option value="">Tutte le categorie</option>
          {options.categories.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="catalog-family" className="mb-1.5 block text-sm font-medium">
          Famiglia
        </label>
        <select
          id="catalog-family"
          name="family"
          defaultValue={filters.familyId ?? ""}
          className={SELECT_STYLES}
        >
          <option value="">Tutte le famiglie</option>
          {options.families.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="catalog-component" className="mb-1.5 block text-sm font-medium">
          Componente
        </label>
        <select
          id="catalog-component"
          name="component"
          defaultValue={filters.componentId ?? ""}
          disabled={!filters.familyId}
          className={SELECT_STYLES}
        >
          <option value="">
            {filters.familyId ? "Tutti i componenti" : "Seleziona prima una famiglia"}
          </option>
          {options.components.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-end gap-2">
        <Button type="submit" className="flex-1">
          <Search aria-hidden="true" />
          Applica filtri
        </Button>
        {hasFilters ? (
          <Button asChild type="button" variant="outline" size="icon">
            <Link href={resetHref} aria-label="Azzera filtri">
              <X aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
