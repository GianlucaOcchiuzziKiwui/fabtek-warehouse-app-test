import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildCatalogNavigationHref,
  buildCatalogPreviousStepHref,
  getCatalogNavigationKindLabel,
  resolveCatalogNavigationStep,
  type CatalogFilterOptions,
  type CatalogFilters,
  type CatalogIconKey,
  type CatalogNavigationKind,
  type CatalogNavigationMatch,
  type CatalogOption,
} from "@/lib/data/catalog-mappers";
import {
  ArrowLeft,
  Boxes,
  Cable,
  Check,
  ChevronRight,
  CircleDot,
  CircleGauge,
  Component,
  Cylinder,
  Droplets,
  Factory,
  FlaskConical,
  FolderTree,
  Gauge,
  GitBranch,
  PackageSearch,
  Plug,
  Search,
  Snowflake,
  Sparkles,
  Waves,
  Wind,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";

const TILE_ICONS: Record<CatalogIconKey, LucideIcon> = {
  boxes: Boxes,
  cable: Cable,
  "circle-dot": CircleDot,
  "circle-gauge": CircleGauge,
  component: Component,
  cylinder: Cylinder,
  droplets: Droplets,
  factory: Factory,
  "flask-conical": FlaskConical,
  gauge: Gauge,
  "git-branch": GitBranch,
  "package-search": PackageSearch,
  plug: Plug,
  snowflake: Snowflake,
  sparkles: Sparkles,
  waves: Waves,
  wind: Wind,
  wrench: Wrench,
};

function CatalogTile({
  href,
  kind,
  iconKey,
  title,
  context,
}: {
  href: string;
  kind: CatalogNavigationKind;
  iconKey: CatalogIconKey;
  title: string;
  context?: string;
}) {
  const Icon = TILE_ICONS[iconKey];

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand-copper hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        data-catalog-tile-icon
        className={`flex items-center justify-center bg-linear-to-br from-brand-navy to-brand-navy-deep text-white ${kind === "category" ? "h-24" : "h-20"}`}
      >
        <Icon aria-hidden="true" className={kind === "category" ? "size-11" : "size-9"} strokeWidth={1.7} />
      </span>
      <span className="flex min-h-18 items-center justify-between gap-3 px-3 py-3">
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-brand-copper">
            {getCatalogNavigationKindLabel(kind)}
          </span>
          <span className="mt-1 block font-heading text-base font-semibold leading-tight text-foreground">
            {title}
          </span>
          {context ? (
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{context}</span>
          ) : null}
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-copper" />
      </span>
    </Link>
  );
}

function optionMatch(
  kind: CatalogNavigationKind,
  option: CatalogOption,
  filters: CatalogFilters,
  options: CatalogFilterOptions,
): CatalogNavigationMatch | null {
  const category = kind === "category"
    ? option
    : options.categories.find((item) => item.id === filters.categoryId) ?? null;
  const family = kind === "family"
    ? option
    : kind === "component"
      ? options.families.find((item) => item.id === filters.familyId) ?? null
      : null;

  if (!category || (kind !== "category" && !family)) return null;
  return {
    kind,
    category,
    family,
    component: kind === "component" ? option : null,
  };
}

function NavigationCards({
  basePath,
  filters,
  options,
  kind,
  items,
}: {
  basePath: string;
  filters: CatalogFilters;
  options: CatalogFilterOptions;
  kind: CatalogNavigationKind;
  items: CatalogOption[];
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={`Nessun${kind === "category" ? "a" : ""} ${getCatalogNavigationKindLabel(kind).toLocaleLowerCase("it-IT")} disponibile`}
        description="Non ci sono percorsi attivi disponibili per questa selezione."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const match = optionMatch(kind, item, filters, options);
        if (!match) return null;
        return (
          <CatalogTile
            key={item.id}
            href={buildCatalogNavigationHref(basePath, match)}
            kind={kind}
            iconKey={item.iconKey}
            title={item.name}
          />
        );
      })}
    </div>
  );
}

function SearchResults({
  basePath,
  query,
  matches,
}: {
  basePath: string;
  query: string;
  matches: CatalogNavigationMatch[];
}) {
  if (matches.length === 0) {
    return (
      <EmptyState
        title="Nessun percorso trovato"
        description={`Nessuna categoria, famiglia o componente corrisponde a “${query}”.`}
        action={<Button asChild variant="outline"><Link href={basePath}>Mostra le categorie</Link></Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      {(["category", "family", "component"] as const).map((kind) => {
        const group = matches.filter((match) => match.kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind} aria-labelledby={`catalog-search-${kind}`} className="space-y-3">
            <h3 id={`catalog-search-${kind}`} className="font-heading text-lg font-semibold">
              {getCatalogNavigationKindLabel(kind, group.length)}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {group.map((match) => {
                const current = match.component ?? match.family ?? match.category;
                const context = [
                  match.category.name,
                  match.family?.name,
                ].filter((name) => name && name !== current.name);
                return (
                  <CatalogTile
                    key={[kind, match.category.id, match.family?.id, match.component?.id].filter(Boolean).join(":")}
                    href={buildCatalogNavigationHref(basePath, match)}
                    kind={kind}
                    iconKey={current.iconKey}
                    title={current.name}
                    context={context.length > 0 ? context.join(" → ") : undefined}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Breadcrumbs({
  basePath,
  filters,
  options,
}: {
  basePath: string;
  filters: CatalogFilters;
  options: CatalogFilterOptions;
}) {
  const category = options.categories.find((item) => item.id === filters.categoryId);
  const family = options.families.find((item) => item.id === filters.familyId);
  const component = options.components.find((item) => item.id === filters.componentId);
  const crumbs = [
    { label: "Categorie", href: basePath },
    category ? {
      label: category.name,
      href: buildCatalogNavigationHref(basePath, {
        kind: "category",
        category,
        family: null,
        component: null,
      }),
    } : null,
    category && family ? {
      label: family.name,
      href: buildCatalogNavigationHref(basePath, {
        kind: "family",
        category,
        family,
        component: null,
      }),
    } : null,
    category && family && component ? {
      label: component.name,
      href: buildCatalogNavigationHref(basePath, {
        kind: "component",
        category,
        family,
        component,
      }),
    } : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <nav aria-label="Percorso catalogo">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {index > 0 ? <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" /> : null}
              {current ? (
                <span aria-current="page" className="px-2 py-2 font-medium text-foreground">{crumb.label}</span>
              ) : (
                <Link className="inline-flex min-h-10 items-center rounded-md px-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={crumb.href}>
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CatalogStepHeading({
  id,
  icon: Icon,
  title,
  description,
  backHref,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  backHref: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="font-heading text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {backHref ? (
        <Button asChild variant="outline" className="h-10 shrink-0">
          <Link href={backHref}>
            <ArrowLeft aria-hidden="true" />
            Indietro
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

export function CatalogNavigation({
  basePath,
  filters,
  options,
  searchMatches,
  rootBackHref,
  compact = false,
  children,
}: {
  basePath: string;
  filters: CatalogFilters;
  options: CatalogFilterOptions;
  searchMatches: CatalogNavigationMatch[];
  rootBackHref?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const step = resolveCatalogNavigationStep(filters);
  const previousStepHref = buildCatalogPreviousStepHref(
    basePath,
    filters,
    rootBackHref,
  );
  const stepContent = {
    categories: {
      number: 1,
      title: "Scegli una categoria",
      description: "Seleziona l’ambito in cui cercare il materiale.",
      icon: FolderTree,
      kind: "category" as const,
      items: options.categories,
    },
    families: {
      number: 2,
      title: "Scegli una famiglia",
      description: "Sono mostrate tutte le famiglie abilitate per la categoria scelta.",
      icon: Boxes,
      kind: "family" as const,
      items: options.families,
    },
    components: {
      number: 3,
      title: "Scegli un componente",
      description: "Sono mostrati tutti i componenti della famiglia scelta.",
      icon: PackageSearch,
      kind: "component" as const,
      items: options.components,
    },
  };

  return (
    <div className="space-y-6">
      <section
        className={compact
          ? "rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4"
          : "rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"}
        aria-labelledby={`catalog-search-heading-${basePath.replaceAll("/", "-")}`}
      >
        <div className={compact ? "flex flex-col gap-3 lg:flex-row lg:items-center" : undefined}>
          <div className={compact ? "shrink-0 lg:w-64" : "mb-4 flex items-start gap-3"}>
            {!compact ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white">
                <Search aria-hidden="true" className="size-5" />
              </span>
            ) : null}
            <div>
              {!compact ? (
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-copper">Ricerca rapida</p>
              ) : null}
              <h2
                id={`catalog-search-heading-${basePath.replaceAll("/", "-")}`}
                className={compact ? "font-heading text-lg font-semibold" : "mt-0.5 font-heading text-xl font-semibold"}
              >
                Trova categoria, famiglia o componente
              </h2>
              {!compact ? (
                <p className="mt-1 text-sm text-muted-foreground">Scrivi un nome per aprire direttamente il percorso corretto nel catalogo.</p>
              ) : null}
            </div>
          </div>
          <Form action={basePath} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`catalog-query-${basePath.replaceAll("/", "-")}`}
                aria-label="Cerca categoria, famiglia o componente"
                className={compact ? "h-10 bg-background pl-11" : "h-12 bg-background pl-11 text-base md:text-base"}
                name="q"
                defaultValue={filters.query}
                maxLength={120}
                placeholder="Es. Gas, Valvole, Raccordi..."
              />
            </div>
            <Button type="submit" className={compact ? "h-10 shrink-0 px-5" : "h-12 shrink-0 px-6"}>
              Cerca
              <ChevronRight aria-hidden="true" />
            </Button>
            {step === "search" ? (
              <Button asChild variant="outline" className={compact ? "h-10 shrink-0" : "h-12 shrink-0"}>
                <Link href={basePath}><X aria-hidden="true" />Azzera</Link>
              </Button>
            ) : null}
          </Form>
        </div>
      </section>

      {step === "search" ? (
        <section aria-labelledby="catalog-search-title" className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-primary">Risultati ricerca</p>
            <h2 id="catalog-search-title" className="mt-1 font-heading text-xl font-semibold">
              Percorsi per “{filters.query}”
            </h2>
          </div>
          <SearchResults basePath={basePath} query={filters.query ?? ""} matches={searchMatches} />
        </section>
      ) : (
        <div className="space-y-5">
          <Breadcrumbs basePath={basePath} filters={filters} options={options} />
          {step === "items" ? (
            <section aria-labelledby="catalog-items-title" className="space-y-4">
              <CatalogStepHeading
                id="catalog-items-title"
                icon={Check}
                title="Scegli un item"
                description="Sono mostrati soltanto gli item del componente selezionato."
                backHref={previousStepHref}
              />
              {children}
            </section>
          ) : (() => {
            const content = stepContent[step];
            const Icon = content.icon;
            const headingId = `catalog-step-${content.number}`;
            return (
              <section aria-labelledby={headingId} className="space-y-4">
                <CatalogStepHeading
                  id={headingId}
                  icon={Icon}
                  title={content.title}
                  description={content.description}
                  backHref={previousStepHref}
                />
                <NavigationCards
                  basePath={basePath}
                  filters={filters}
                  options={options}
                  kind={content.kind}
                  items={content.items}
                />
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
}
