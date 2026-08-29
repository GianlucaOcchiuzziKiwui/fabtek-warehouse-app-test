import "server-only";

import { requirePermission } from "@/lib/auth/current-profile";
import {
  mapCatalogNavigationMatches,
  mapCatalogOptions,
  mapDerivedCatalogOptions,
  mapCatalogSelections,
  mapCatalogRows,
  normalizeCatalogSelectionInputs,
  type CatalogFilterOptions,
  type CatalogFilters,
  type CatalogNavigationMatch,
  type CatalogOption,
  type CatalogSelection,
  type CatalogSelectionInput,
  type CatalogVariant,
  type StockView,
} from "@/lib/data/catalog-mappers";
import { createClient } from "@/lib/supabase/server";
import { applyCatalogVariantOrdering } from "@/lib/data/admin-catalog";

export type {
  CatalogFilterOptions,
  CatalogFilters,
  CatalogNavigationMatch,
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
const NAVIGATION_SEARCH_LIMIT = 12;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DERIVED_TAXONOMY_SELECT = `
  item_variant:item_variants!inner(
    is_active,
    component:components!inner(
      id,
      name,
      icon_key,
      sort_order,
      family_id,
      is_active,
      family:families!inner(id, name, icon_key, sort_order, is_active)
    )
  )
`;

const FAMILY_SEARCH_SELECT = `
  id,
  name,
  icon_key,
  is_active,
  components:components!inner(
    is_active,
    items:item_variants!inner(
      is_active,
      categories:item_variant_categories!inner(
        category:categories!inner(id, name, icon_key, is_active)
      )
    )
  )
`;

const COMPONENT_SEARCH_SELECT = `
  id,
  name,
  icon_key,
  is_active,
  family:families!inner(id, name, icon_key, is_active),
  items:item_variants!inner(
    is_active,
    categories:item_variant_categories!inner(
      category:categories!inner(id, name, icon_key, is_active)
    )
  )
`;

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
    icon_key,
    family:families!inner(id, name, icon_key)
  ),
  unit_of_measure:units_of_measure!inner(code, name),
  categories:item_variant_categories!inner(
    category:categories!inner(id, name, icon_key)
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
  oracle_sapio_code,
  description,
  diameter,
  material,
  connection,
  component:components!inner(
    id,
    name,
    icon_key,
    family:families!inner(id, name, icon_key)
  ),
  unit_of_measure:units_of_measure!inner(code, name),
  categories:item_variant_categories!inner(
    category:categories!inner(id, name, icon_key)
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
  const escaped = escapePostgrestIlikePattern(value);

  // Quoted PostgREST values preserve commas and parentheses as literal text.
  return `"%${escaped}%"`;
}

function escapePostgrestIlikePattern(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/[%_*]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (isRecord(value)) return [value];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function collectItemCategories(items: unknown): unknown[] {
  return recordArray(items).flatMap((item) => (
    recordArray(item.categories).map((relation) => relation.category)
  ));
}

function collectFamilyCategories(components: unknown): unknown[] {
  return recordArray(components).flatMap((component) => (
    collectItemCategories(component.items)
  ));
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
    .select("id, name, icon_key, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  const familiesQuery = normalized.categoryId
    ? supabase
        .from("item_variant_categories")
        .select(DERIVED_TAXONOMY_SELECT)
        .eq("category_id", normalized.categoryId)
        .eq("item_variant.is_active", true)
        .eq("item_variant.component.is_active", true)
        .eq("item_variant.component.family.is_active", true)
    : Promise.resolve({ data: [], error: null });

  const componentsQuery = normalized.categoryId && normalized.familyId
    ? supabase
        .from("item_variant_categories")
        .select(DERIVED_TAXONOMY_SELECT)
        .eq("category_id", normalized.categoryId)
        .eq("item_variant.is_active", true)
        .eq("item_variant.component.is_active", true)
        .eq("item_variant.component.family_id", normalized.familyId)
        .eq("item_variant.component.family.is_active", true)
    : Promise.resolve({ data: [], error: null });

  const [categoriesResponse, familiesResponse, componentsResponse] = await Promise.all([
    categoriesQuery,
    familiesQuery,
    componentsQuery,
  ]);

  if (categoriesResponse.error) reportCatalogError("load categories", categoriesResponse.error);
  if (familiesResponse.error) reportCatalogError("load families", familiesResponse.error);
  if (componentsResponse.error) reportCatalogError("load components", componentsResponse.error);

  const categories = mapCatalogOptions(categoriesResponse.data, "factory");
  const families = mapDerivedCatalogOptions(familiesResponse.data, "family");
  const familyIsSelectable = !normalized.familyId
    || families.some((option) => option.id === normalized.familyId);

  return {
    categories,
    families,
    components: familyIsSelectable
      ? mapDerivedCatalogOptions(componentsResponse.data, "component")
      : [],
  };
}

export async function searchCatalogNavigation(
  query: string,
): Promise<CatalogNavigationMatch[]> {
  await requirePermission("catalog:read");
  const normalizedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!normalizedQuery) return [];

  const supabase = await createClient();
  const pattern = `%${escapePostgrestIlikePattern(normalizedQuery)}%`;
  const [categoriesResponse, familiesResponse, componentsResponse] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, icon_key")
      .eq("is_active", true)
      .ilike("name", pattern)
      .order("name")
      .limit(NAVIGATION_SEARCH_LIMIT),
    supabase
      .from("families")
      .select(FAMILY_SEARCH_SELECT)
      .eq("is_active", true)
      .eq("components.is_active", true)
      .eq("components.items.is_active", true)
      .eq("components.items.categories.category.is_active", true)
      .ilike("name", pattern)
      .order("name")
      .limit(NAVIGATION_SEARCH_LIMIT),
    supabase
      .from("components")
      .select(COMPONENT_SEARCH_SELECT)
      .eq("is_active", true)
      .eq("family.is_active", true)
      .eq("items.is_active", true)
      .eq("items.categories.category.is_active", true)
      .ilike("name", pattern)
      .order("name")
      .limit(NAVIGATION_SEARCH_LIMIT),
  ]);

  if (categoriesResponse.error) reportCatalogError("search categories", categoriesResponse.error);
  if (familiesResponse.error) reportCatalogError("search families", familiesResponse.error);
  if (componentsResponse.error) reportCatalogError("search components", componentsResponse.error);

  const rawMatches: unknown[] = [
    ...(categoriesResponse.data ?? []).map((category) => ({ kind: "category", category })),
  ];

  for (const family of recordArray(familiesResponse.data)) {
    for (const category of collectFamilyCategories(family.components)) {
      rawMatches.push({ kind: "family", category, family });
    }
  }

  for (const component of recordArray(componentsResponse.data)) {
    for (const category of collectItemCategories(component.items)) {
      rawMatches.push({
        kind: "component",
        category,
        family: component.family,
        component,
      });
    }
  }

  return mapCatalogNavigationMatches(rawMatches);
}

export async function searchCatalog(
  filters: CatalogFilters,
): Promise<CatalogSearchResult> {
  await requirePermission("catalog:read");
  const normalized = normalizeFilters(filters);
  if (!normalized.categoryId || !normalized.familyId || !normalized.componentId) {
    return { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 };
  }
  const supabase = await createClient();
  const from = (normalized.page - 1) * PAGE_SIZE;

  let catalogQuery = applyCatalogVariantOrdering(
    supabase
      .from("item_variants")
      .select(CATALOG_SELECT, { count: "exact" })
      .eq("is_active", true)
      .eq("component.is_active", true)
      .eq("component.family.is_active", true)
      .eq("unit_of_measure.is_active", true)
      .eq("categories.category.is_active", true)
      .eq("suppliers.supplier.is_active", true)
      .eq("assets.is_active", true)
      .eq("assets.kind", "datasheet"),
  ).range(from, from + PAGE_SIZE - 1);

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

  const catalogResponse = await catalogQuery;
  if (catalogResponse.error) reportCatalogError("search variants", catalogResponse.error);
  const variantIds = (catalogResponse.data ?? []).flatMap((row) => {
    const id = isRecord(row) ? text(row.id) : null;
    return id ? [id] : [];
  });
  const availabilityPromise = variantIds.length > 0
    ? supabase.rpc("get_catalog_availability").in("item_variant_id", variantIds)
    : Promise.resolve({ data: [], error: null });
  const [availabilityResponse, signedUrls] = await Promise.all([
    availabilityPromise,
    getSignedDatasheetUrls(supabase, catalogResponse.data),
  ]);
  if (availabilityResponse.error) reportCatalogError("load availability", availabilityResponse.error);

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
