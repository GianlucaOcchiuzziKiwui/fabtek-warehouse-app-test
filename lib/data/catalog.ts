import "server-only";

import { requirePermission } from "@/lib/auth/current-profile";
import {
  mapCatalogSelections,
  mapCatalogRows,
  normalizeCatalogSelectionInputs,
  type CatalogFilterOptions,
  type CatalogFilters,
  type CatalogOption,
  type CatalogSelection,
  type CatalogSelectionInput,
  type CatalogVariant,
  type StockView,
} from "@/lib/data/catalog-mappers";
import { createClient } from "@/lib/supabase/server";

export type {
  CatalogFilterOptions,
  CatalogFilters,
  CatalogOption,
  CatalogSelection,
  CatalogSelectionInput,
  CatalogVariant,
  StockView,
};

export type CatalogSearchResult = {
  items: CatalogVariant[];
  page: number;
  pageSize: number;
  total: number;
};

export class CatalogDataError extends Error {
  constructor() {
    super("Il catalogo non è disponibile in questo momento.");
    this.name = "CatalogDataError";
  }
}

const PAGE_SIZE = 24;
const MAX_QUERY_LENGTH = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATALOG_SELECT = `
  id,
  fabtek_code,
  oracle_sapio_code,
  description,
  diameter,
  material,
  connection,
  technical_attributes,
  component:components!inner(
    id,
    name,
    family:families!inner(id, name)
  ),
  unit_of_measure:units_of_measure!inner(code, name),
  categories:item_variant_categories!inner(
    category:categories!inner(id, name)
  ),
  suppliers:item_variant_suppliers(
    supplier_part_number,
    is_preferred,
    supplier:suppliers!inner(name)
  ),
  assets:product_assets(kind, title, storage_path, external_url)
`;

const CATALOG_SELECTION_SELECT = `
  id,
  fabtek_code,
  description,
  diameter,
  material,
  connection,
  component:components!inner(
    id,
    name,
    family:families!inner(id, name)
  ),
  unit_of_measure:units_of_measure!inner(code, name),
  categories:item_variant_categories!inner(
    category:categories!inner(id, name)
  )
`;

type NormalizedCatalogFilters = {
  query: string;
  categoryId: string | null;
  familyId: string | null;
  componentId: string | null;
  page: number;
};

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeFilters(filters: CatalogFilters): NormalizedCatalogFilters {
  const query = typeof filters.query === "string"
    ? filters.query.trim().slice(0, MAX_QUERY_LENGTH)
    : "";
  const page = typeof filters.page === "number"
    && Number.isInteger(filters.page)
    && filters.page > 0
    ? filters.page
    : 1;

  return {
    query,
    categoryId: normalizeId(filters.categoryId),
    familyId: normalizeId(filters.familyId),
    componentId: normalizeId(filters.componentId),
    page,
  };
}

function escapePostgrestSearchPattern(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/[%_*]/g, "\\$&");

  // Quoted PostgREST values preserve commas and parentheses as literal text.
  return `"%${escaped}%"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function mapOptions(rows: unknown, relation?: string): CatalogOption[] {
  if (!Array.isArray(rows)) return [];

  const options = new Map<string, CatalogOption>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const value = relation && isRecord(row[relation]) ? row[relation] : row;
    if (!isRecord(value)) continue;

    const id = text(value.id);
    const name = text(value.name);
    if (id && name) options.set(id, { id, name });
  }

  return [...options.values()];
}

function collectDatasheetStoragePaths(rows: unknown) {
  const paths = new Set<string>();
  if (!Array.isArray(rows)) return paths;

  for (const row of rows) {
    if (!isRecord(row) || !Array.isArray(row.assets)) continue;
    for (const asset of row.assets) {
      if (!isRecord(asset) || asset.kind !== "datasheet") continue;
      const path = text(asset.storage_path);
      if (path) paths.add(path);
    }
  }

  return paths;
}

function reportCatalogError(operation: string, error: unknown): never {
  const code = isRecord(error) ? text(error.code) : null;
  console.error("Supabase catalog operation failed", { operation, code });
  throw new CatalogDataError();
}

async function getSignedDatasheetUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: unknown,
) {
  const paths = collectDatasheetStoragePaths(rows);
  if (paths.size === 0) return new Map<string, string>();

  const { data, error } = await supabase.storage
    .from("datasheets")
    .createSignedUrls([...paths], 600);
  if (error) reportCatalogError("sign datasheets", error);

  const signedUrls = new Map<string, string>();
  for (const item of data ?? []) {
    const path = text(item.path);
    const signedUrl = text(item.signedUrl);
    if (path && signedUrl) signedUrls.set(path, signedUrl);
  }

  if (signedUrls.size !== paths.size) {
    reportCatalogError("sign datasheets", null);
  }

  return signedUrls;
}

export async function getCatalogFilters(
  filters: CatalogFilters,
): Promise<CatalogFilterOptions> {
  await requirePermission("catalog:read");
  const normalized = normalizeFilters(filters);
  const supabase = await createClient();

  const categoriesQuery = supabase
    .from("categories")
    .select("id, name, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  const familiesQuery = normalized.categoryId
    ? supabase
        .from("category_families")
        .select("family:families!inner(id, name, sort_order, is_active), category:categories!inner(id, is_active)")
        .eq("category_id", normalized.categoryId)
        .eq("is_active", true)
        .eq("family.is_active", true)
        .eq("category.is_active", true)
        .order("sort_order", { referencedTable: "family" })
    : supabase
        .from("families")
        .select("id, name, sort_order")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");

  const componentsQuery = normalized.familyId
    ? supabase
        .from("components")
        .select("id, name, sort_order, family:families!inner(id, is_active)")
        .eq("family_id", normalized.familyId)
        .eq("is_active", true)
        .eq("family.is_active", true)
        .order("sort_order")
        .order("name")
    : Promise.resolve({ data: [], error: null });

  const [categoriesResponse, familiesResponse, componentsResponse] = await Promise.all([
    categoriesQuery,
    familiesQuery,
    componentsQuery,
  ]);

  if (categoriesResponse.error) reportCatalogError("load categories", categoriesResponse.error);
  if (familiesResponse.error) reportCatalogError("load families", familiesResponse.error);
  if (componentsResponse.error) reportCatalogError("load components", componentsResponse.error);

  const categories = mapOptions(categoriesResponse.data);
  const families = mapOptions(
    familiesResponse.data,
    normalized.categoryId ? "family" : undefined,
  );
  const familyIsSelectable = !normalized.familyId
    || families.some((option) => option.id === normalized.familyId);

  return {
    categories,
    families,
    components: familyIsSelectable
      ? mapOptions(componentsResponse.data)
      : [],
  };
}

export async function searchCatalog(
  filters: CatalogFilters,
): Promise<CatalogSearchResult> {
  await requirePermission("catalog:read");
  const normalized = normalizeFilters(filters);
  const supabase = await createClient();
  const from = (normalized.page - 1) * PAGE_SIZE;

  let catalogQuery = supabase
    .from("item_variants")
    .select(CATALOG_SELECT, { count: "exact" })
    .eq("is_active", true)
    .eq("component.is_active", true)
    .eq("component.family.is_active", true)
    .eq("unit_of_measure.is_active", true)
    .eq("categories.category.is_active", true)
    .eq("suppliers.supplier.is_active", true)
    .eq("assets.is_active", true)
    .eq("assets.kind", "datasheet")
    .order("fabtek_code")
    .range(from, from + PAGE_SIZE - 1);

  if (normalized.query) {
    const pattern = escapePostgrestSearchPattern(normalized.query);
    catalogQuery = catalogQuery.or(
      `fabtek_code.ilike.${pattern},oracle_sapio_code.ilike.${pattern},description.ilike.${pattern}`,
    );
  }
  if (normalized.categoryId) {
    catalogQuery = catalogQuery.eq("categories.category_id", normalized.categoryId);
  }
  if (normalized.familyId) {
    catalogQuery = catalogQuery.eq("component.family_id", normalized.familyId);
  }
  if (normalized.componentId) {
    catalogQuery = catalogQuery.eq("component_id", normalized.componentId);
  }

  const [catalogResponse, availabilityResponse] = await Promise.all([
    catalogQuery,
    supabase.rpc("get_catalog_availability"),
  ]);

  if (catalogResponse.error) reportCatalogError("search variants", catalogResponse.error);
  if (availabilityResponse.error) reportCatalogError("load availability", availabilityResponse.error);

  const signedUrls = await getSignedDatasheetUrls(supabase, catalogResponse.data);
  return {
    items: mapCatalogRows(
      catalogResponse.data ?? [],
      availabilityResponse.data ?? [],
      signedUrls,
    ),
    page: normalized.page,
    pageSize: PAGE_SIZE,
    total: catalogResponse.count ?? 0,
  };
}

export async function getCatalogVariantSelection(
  variantId: string,
  categoryId: string,
): Promise<CatalogVariant | null> {
  const selections = await getCatalogVariantSelections([{
    itemVariantId: variantId,
    categoryId,
  }]);
  return selections[0]?.variant ?? null;
}

export async function getCatalogVariantSelections(
  inputs: readonly CatalogSelectionInput[],
): Promise<CatalogSelection[]> {
  await requirePermission("catalog:read");
  const normalized = normalizeCatalogSelectionInputs(inputs);
  if (normalized.length === 0) return [];

  const variantIds = [...new Set(normalized.map((input) => input.itemVariantId))];
  const categoryIds = [...new Set(normalized.map((input) => input.categoryId))];

  const supabase = await createClient();
  const catalogQuery = supabase
    .from("item_variants")
    .select(CATALOG_SELECTION_SELECT)
    .in("id", variantIds)
    .eq("is_active", true)
    .eq("component.is_active", true)
    .eq("component.family.is_active", true)
    .eq("unit_of_measure.is_active", true)
    .in("categories.category_id", categoryIds)
    .eq("categories.category.is_active", true)
    .limit(variantIds.length);

  const [catalogResponse, availabilityResponse] = await Promise.all([
    catalogQuery,
    supabase.rpc("get_catalog_availability").in("item_variant_id", variantIds),
  ]);

  if (catalogResponse.error) reportCatalogError("load variants", catalogResponse.error);
  if (availabilityResponse.error) reportCatalogError("load availability", availabilityResponse.error);

  const variants = mapCatalogRows(
    catalogResponse.data ?? [],
    availabilityResponse.data ?? [],
  );
  return mapCatalogSelections(normalized, variants);
}
