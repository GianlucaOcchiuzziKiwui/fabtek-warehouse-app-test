export const CATALOG_ICON_KEYS = [
  "boxes",
  "cable",
  "circle-dot",
  "circle-gauge",
  "component",
  "cylinder",
  "droplets",
  "factory",
  "flask-conical",
  "gauge",
  "git-branch",
  "package-search",
  "plug",
  "snowflake",
  "sparkles",
  "waves",
  "wind",
  "wrench",
] as const;

export type CatalogIconKey = typeof CATALOG_ICON_KEYS[number];

export type CatalogOption = {
  id: string;
  name: string;
  iconKey: CatalogIconKey;
};

export type CatalogFilters = {
  query?: string;
  categoryId?: string;
  familyId?: string;
  componentId?: string;
  page?: number;
};

export type CatalogFilterOptions = {
  categories: CatalogOption[];
  families: CatalogOption[];
  components: CatalogOption[];
};

export type CatalogNavigationStep =
  | "search"
  | "categories"
  | "families"
  | "components"
  | "items";

export type CatalogNavigationKind = "category" | "family" | "component";

const CATALOG_NAVIGATION_KIND_LABELS: Record<
  CatalogNavigationKind,
  readonly [singular: string, plural: string]
> = {
  category: ["Categoria", "Categorie"],
  family: ["Famiglia", "Famiglie"],
  component: ["Componente", "Componenti"],
};

export function getCatalogNavigationKindLabel(
  kind: CatalogNavigationKind,
  count = 1,
): string {
  return CATALOG_NAVIGATION_KIND_LABELS[kind][count === 1 ? 0 : 1];
}

export type CatalogNavigationMatch = {
  kind: CatalogNavigationKind;
  category: CatalogOption;
  family: CatalogOption | null;
  component: CatalogOption | null;
};

export function resolveCatalogNavigationStep(
  filters: CatalogFilters,
): CatalogNavigationStep {
  if (filters.query?.trim()) return "search";
  if (!filters.categoryId) return "categories";
  if (!filters.familyId) return "families";
  if (!filters.componentId) return "components";
  return "items";
}

export function mapCatalogNavigationMatches(
  rows: readonly unknown[],
): CatalogNavigationMatch[] {
  const matches: CatalogNavigationMatch[] = [];
  const keys = new Set<string>();

  for (const value of rows) {
    if (!isRecord(value)) continue;
    const kind = text(value.kind);
    if (kind !== "category" && kind !== "family" && kind !== "component") {
      continue;
    }

    const category = mapOption(value.category, "factory");
    const family = kind === "category" ? null : mapOption(value.family, "boxes");
    const component = kind === "component" ? mapOption(value.component, "component") : null;
    if (!category || (kind !== "category" && !family) || (kind === "component" && !component)) {
      continue;
    }

    const key = [kind, category.id, family?.id, component?.id].filter(Boolean).join(":");
    if (keys.has(key)) continue;
    keys.add(key);
    matches.push({ kind, category, family, component });
  }

  return matches;
}

export function buildCatalogNavigationHref(
  basePath: string,
  match: CatalogNavigationMatch,
): string {
  const params = new URLSearchParams({ category: match.category.id });
  if (match.family) params.set("family", match.family.id);
  if (match.component) params.set("component", match.component.id);
  return `${basePath}?${params}`;
}

export function buildCatalogPreviousStepHref(
  basePath: string,
  filters: CatalogFilters,
  rootBackHref?: string,
): string | null {
  switch (resolveCatalogNavigationStep(filters)) {
    case "categories":
      return rootBackHref ?? null;
    case "families":
      return basePath;
    case "components": {
      if (!filters.categoryId) return basePath;
      return `${basePath}?${new URLSearchParams({ category: filters.categoryId })}`;
    }
    case "items": {
      if (!filters.categoryId || !filters.familyId) return basePath;
      return `${basePath}?${new URLSearchParams({
        category: filters.categoryId,
        family: filters.familyId,
      })}`;
    }
    case "search":
      return null;
  }
}

export type StockStatus =
  | "available"
  | "low_stock"
  | "out_of_stock"
  | "unlimited"
  | "unknown";

export type StockView = {
  trackInventory: boolean;
  availableQuantity: number | null;
  lowStockThreshold: number | null;
  status: StockStatus;
};

export type CatalogSupplier = {
  name: string;
  partNumber: string | null;
};

export type CatalogDatasheet = {
  title: string | null;
  url: string;
};

export type CatalogVariant = {
  id: string;
  fabtekCode: string;
  oracleSapioCode: string | null;
  description: string;
  diameter: string | null;
  material: string;
  connection: string;
  technicalAttributes: Record<string, unknown>;
  component: CatalogOption | null;
  family: CatalogOption | null;
  unitOfMeasure: { code: string; name: string } | null;
  categories: CatalogOption[];
  supplier: CatalogSupplier | null;
  datasheet: CatalogDatasheet | null;
  stock: StockView;
};

export type CatalogSelectionInput = {
  itemVariantId: string;
  categoryId: string;
};

export type CatalogSelection = CatalogSelectionInput & {
  variant: CatalogVariant;
};

export type AvailabilityLabel = {
  label: string;
  tone: "good" | "warning" | "danger" | "neutral";
};

const STOCK_STATUSES = new Set<StockStatus>([
  "available",
  "low_stock",
  "out_of_stock",
  "unlimited",
  "unknown",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNKNOWN_STOCK: StockView = {
  trackInventory: true,
  availableQuantity: null,
  lowStockThreshold: null,
  status: "unknown",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (Array.isArray(value)) {
    return value.find(isRecord) ?? null;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function nullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

const CATALOG_ICON_KEY_SET = new Set<string>(CATALOG_ICON_KEYS);

export function normalizeCatalogIconKey(
  value: unknown,
  fallback: CatalogIconKey,
): CatalogIconKey {
  const normalized = text(value);
  return normalized && CATALOG_ICON_KEY_SET.has(normalized)
    ? normalized as CatalogIconKey
    : fallback;
}

function mapOption(
  value: unknown,
  fallbackIconKey: CatalogIconKey,
): CatalogOption | null {
  const record = firstRecord(value);
  if (!record) return null;

  const id = text(record.id);
  const name = text(record.name);
  return id && name
    ? { id, name, iconKey: normalizeCatalogIconKey(record.icon_key, fallbackIconKey) }
    : null;
}

export function mapCatalogOptions(
  rows: unknown,
  fallbackIconKey: CatalogIconKey,
  relation?: string,
): CatalogOption[] {
  if (!Array.isArray(rows)) return [];

  const options = new Map<string, CatalogOption>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const option = mapOption(relation ? row[relation] : row, fallbackIconKey);
    if (option) options.set(option.id, option);
  }

  return [...options.values()];
}

export function mapDerivedCatalogOptions(
  rows: unknown,
  kind: "family" | "component",
): CatalogOption[] {
  if (!Array.isArray(rows)) return [];

  const fallbackIcon: CatalogIconKey = kind === "family" ? "boxes" : "component";
  const entries = new Map<string, { option: CatalogOption; sortOrder: number }>();

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const variant = firstRecord(row.item_variant);
    const component = firstRecord(variant?.component);
    const family = firstRecord(component?.family);
    if (
      variant?.is_active !== true
      || component?.is_active !== true
      || family?.is_active !== true
    ) {
      continue;
    }

    const record = kind === "family" ? family : component;
    const option = mapOption(record, fallbackIcon);
    if (!option) continue;
    entries.set(option.id, {
      option,
      sortOrder: nullableInteger(record.sort_order) ?? 0,
    });
  }

  return [...entries.values()]
    .sort((left, right) => (
      left.sortOrder - right.sortOrder
      || left.option.name.localeCompare(right.option.name, "it", { sensitivity: "base" })
    ))
    .map(({ option }) => option);
}

function mapStockRows(rows: readonly unknown[]) {
  const stocks = new Map<string, StockView>();

  for (const value of rows) {
    if (!isRecord(value)) continue;
    const id = text(value.item_variant_id);
    if (!id || typeof value.track_inventory !== "boolean") continue;

    const status = text(value.stock_status);
    stocks.set(id, {
      trackInventory: value.track_inventory,
      availableQuantity: nullableInteger(value.available_quantity),
      lowStockThreshold: nullableInteger(value.low_stock_threshold),
      status: status && STOCK_STATUSES.has(status as StockStatus)
        ? status as StockStatus
        : "unknown",
    });
  }

  return stocks;
}

function mapCategories(value: unknown): CatalogOption[] {
  if (!Array.isArray(value)) return [];

  const categories = new Map<string, CatalogOption>();
  for (const relation of value) {
    const category = isRecord(relation)
      ? mapOption(relation.category, "factory")
      : null;
    if (category) categories.set(category.id, category);
  }

  return [...categories.values()];
}

function mapSupplier(value: unknown): CatalogSupplier | null {
  if (!Array.isArray(value)) return null;

  const relations = value.filter(isRecord);
  const relation = relations.find((item) => item.is_preferred === true)
    ?? relations[0];
  const supplier = relation ? firstRecord(relation.supplier) : null;
  const name = supplier ? text(supplier.name) : null;

  return name
    ? { name, partNumber: text(relation?.supplier_part_number) }
    : null;
}

function mapDatasheet(
  value: unknown,
  signedDatasheetUrls: ReadonlyMap<string, string>,
): CatalogDatasheet | null {
  if (!Array.isArray(value)) return null;

  for (const asset of value) {
    if (!isRecord(asset) || asset.kind !== "datasheet") continue;

    const externalUrl = text(asset.external_url);
    const storagePath = text(asset.storage_path);
    const url = externalUrl ?? (storagePath
      ? signedDatasheetUrls.get(storagePath) ?? null
      : null);

    if (url) return { title: text(asset.title), url };
  }

  return null;
}

function includesOption(options: CatalogOption[], id: string | undefined) {
  return Boolean(id && options.some((option) => option.id === id));
}

export function normalizeCatalogSelectionInputs(
  inputs: readonly unknown[],
): CatalogSelectionInput[] {
  const normalized: CatalogSelectionInput[] = [];
  const selectionKeys = new Set<string>();

  for (const input of inputs) {
    if (!isRecord(input)) continue;
    const itemVariantId = text(input.itemVariantId);
    const categoryId = text(input.categoryId);
    if (
      !itemVariantId
      || !categoryId
      || !UUID_PATTERN.test(itemVariantId)
      || !UUID_PATTERN.test(categoryId)
    ) {
      continue;
    }

    const key = `${itemVariantId}:${categoryId}`;
    if (selectionKeys.has(key)) continue;
    selectionKeys.add(key);
    normalized.push({ itemVariantId, categoryId });
  }

  return normalized;
}

export function mapCatalogSelections(
  inputs: readonly CatalogSelectionInput[],
  variants: readonly CatalogVariant[],
): CatalogSelection[] {
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

  return inputs.flatMap((input) => {
    const variant = variantsById.get(input.itemVariantId);
    const hasCategory = variant?.categories.some(
      (category) => category.id === input.categoryId,
    );
    return variant && hasCategory ? [{ ...input, variant }] : [];
  });
}

export function canonicalizeCatalogFilters(
  filters: CatalogFilters,
  options: CatalogFilterOptions,
): CatalogFilters {
  if (filters.query?.trim()) {
    return {
      ...filters,
      categoryId: undefined,
      familyId: undefined,
      componentId: undefined,
      page: 1,
    };
  }

  const categoryId = filters.categoryId
    && includesOption(options.categories, filters.categoryId)
    ? filters.categoryId
    : undefined;
  const familyId = categoryId
    && filters.familyId
    && includesOption(options.families, filters.familyId)
    ? filters.familyId
    : undefined;
  const componentId = familyId
    && filters.componentId
    && includesOption(options.components, filters.componentId)
    ? filters.componentId
    : undefined;
  const hierarchyChanged = categoryId !== filters.categoryId
    || familyId !== filters.familyId
    || componentId !== filters.componentId;

  return {
    ...filters,
    categoryId,
    familyId,
    componentId,
    page: hierarchyChanged ? 1 : filters.page,
  };
}

export function getAvailabilityLabel(stock: StockView): AvailabilityLabel {
  if (!stock.trackInventory || stock.status === "unlimited") {
    return { label: "Disponibilità non limitata", tone: "neutral" };
  }

  if (stock.status === "out_of_stock") {
    return { label: "Non disponibile", tone: "danger" };
  }

  if (stock.status === "low_stock") {
    return {
      label: stock.availableQuantity === null
        ? "Scorta ridotta"
        : `${stock.availableQuantity} disponibili`,
      tone: "warning",
    };
  }

  if (stock.status === "available" && stock.availableQuantity !== null) {
    return { label: `${stock.availableQuantity} disponibili`, tone: "good" };
  }

  return { label: "Disponibilità da verificare", tone: "neutral" };
}

export function mapCatalogRows(
  rows: readonly unknown[],
  availabilityRows: readonly unknown[],
  signedDatasheetUrls: ReadonlyMap<string, string> = new Map(),
): CatalogVariant[] {
  const stocks = mapStockRows(availabilityRows);
  const variants: CatalogVariant[] = [];

  for (const value of rows) {
    if (!isRecord(value)) continue;
    const id = text(value.id);
    const fabtekCode = text(value.fabtek_code);
    if (!id || !fabtekCode) continue;

    const componentRecord = firstRecord(value.component);
    const unitRecord = firstRecord(value.unit_of_measure);
    const unitCode = unitRecord ? text(unitRecord.code) : null;
    const unitName = unitRecord ? text(unitRecord.name) : null;
    const technicalAttributes = isRecord(value.technical_attributes)
      ? value.technical_attributes
      : {};

    variants.push({
      id,
      fabtekCode,
      oracleSapioCode: text(value.oracle_sapio_code),
      description: text(value.description) ?? "",
      diameter: text(value.diameter),
      material: text(value.material) ?? "",
      connection: text(value.connection) ?? "",
      technicalAttributes,
      component: mapOption(componentRecord, "component"),
      family: mapOption(componentRecord?.family, "boxes"),
      unitOfMeasure: unitCode && unitName
        ? { code: unitCode, name: unitName }
        : null,
      categories: mapCategories(value.categories),
      supplier: mapSupplier(value.suppliers),
      datasheet: mapDatasheet(value.assets, signedDatasheetUrls),
      stock: stocks.get(id) ?? { ...UNKNOWN_STOCK },
    });
  }

  return variants;
}
