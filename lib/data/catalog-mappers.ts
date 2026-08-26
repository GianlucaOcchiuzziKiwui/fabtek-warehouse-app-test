export type CatalogOption = {
  id: string;
  name: string;
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

function mapOption(value: unknown): CatalogOption | null {
  const record = firstRecord(value);
  if (!record) return null;

  const id = text(record.id);
  const name = text(record.name);
  return id && name ? { id, name } : null;
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
      ? mapOption(relation.category)
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

export function canonicalizeCatalogFilters(
  filters: CatalogFilters,
  options: CatalogFilterOptions,
): CatalogFilters {
  const categoryId = filters.categoryId
    && includesOption(options.categories, filters.categoryId)
    ? filters.categoryId
    : undefined;
  const familyId = (!filters.categoryId || categoryId)
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
      component: mapOption(componentRecord),
      family: mapOption(componentRecord?.family),
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
