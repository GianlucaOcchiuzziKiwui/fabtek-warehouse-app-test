import "server-only";

import type { ActionResult } from "../domain/action-result.ts";
import type {
  AdminCatalogListQuery,
  AdminCatalogTab,
  CatalogMutationResult,
  CategoryInput,
  ComponentInput,
  FamilyInput,
  UnitInput,
  VariantInput,
} from "../domain/admin-catalog/contracts.ts";
import {
  CATALOG_ICON_KEYS,
  type CatalogIconKey,
} from "./catalog-mappers.ts";
import {
  collectPaginatedRows,
  getSafePaginationRange,
} from "./paginated-query.ts";

const PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CATALOG_ICON_KEY_SET = new Set<string>(CATALOG_ICON_KEYS);

const CATEGORY_SELECT = `
  id,
  code,
  name,
  subtitle,
  icon_key,
  sort_order,
  is_active
`;

const FAMILY_SELECT = `
  id,
  source_code,
  name,
  subtitle,
  icon_key,
  sort_order,
  is_active
`;

const COMPONENT_SELECT = `
  id,
  family_id,
  name,
  description,
  icon_key,
  sort_order,
  is_active,
  family:families!inner(id, name, is_active)
`;

const VARIANT_SELECT = `
  id,
  component_id,
  fabtek_code,
  oracle_sapio_code,
  datasheet_url,
  description,
  diameter,
  material,
  connection,
  unit_of_measure_id,
  track_inventory,
  sort_order,
  is_active,
  component:components!inner(
    id,
    name,
    is_active,
    family:families!inner(id, name, is_active)
  ),
  unit_of_measure:units_of_measure!inner(id, code, name, is_active),
  categories:item_variant_categories(
    category:categories!inner(id, code, name, is_active)
  )
`;

const COMPONENT_OPTION_SELECT = `
  id,
  name,
  family_id,
  is_active,
  family:families!inner(id, name, is_active)
`;

type QueryResponse = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type SelectOptions = { count: "exact" };
type OrderOptions = { ascending?: boolean };

interface AdminCatalogQuery extends PromiseLike<QueryResponse> {
  select(columns: string, options?: SelectOptions): AdminCatalogQuery;
  eq(column: string, value: unknown): AdminCatalogQuery;
  or(filters: string): AdminCatalogQuery;
  order(column: string, options?: OrderOptions): AdminCatalogQuery;
  range(from: number, to: number): AdminCatalogQuery;
  insert(payload: Record<string, unknown>): AdminCatalogQuery;
  update(payload: Record<string, unknown>): AdminCatalogQuery;
  delete(): AdminCatalogQuery;
  maybeSingle(): PromiseLike<QueryResponse>;
}

type AdminCatalogClient = {
  from(table: string): AdminCatalogQuery;
  rpc(
    name: "save_catalog_variant",
    args: Record<string, unknown>,
  ): PromiseLike<QueryResponse>;
};

type AdminCatalogDependencies = {
  createClient: () => AdminCatalogClient | Promise<AdminCatalogClient>;
};

type CatalogEntityTable =
  | "categories"
  | "families"
  | "components"
  | "item_variants";

const TABLE_BY_TAB: Record<AdminCatalogTab, CatalogEntityTable> = {
  categorie: "categories",
  famiglie: "families",
  componenti: "components",
  varianti: "item_variants",
};

type AdminCatalogBaseRow = {
  id: string;
  sortOrder: number;
  isActive: boolean;
};

export type AdminCategoryRow = AdminCatalogBaseRow & {
  kind: "categoria";
  code: string;
  name: string;
  subtitle: string | null;
  iconKey: CatalogIconKey;
};

export type AdminFamilyRow = AdminCatalogBaseRow & {
  kind: "famiglia";
  sourceCode: string | null;
  name: string;
  subtitle: string | null;
  iconKey: CatalogIconKey;
};

export type AdminRelationOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type AdminCategoryOption = AdminRelationOption & {
  code: string;
};

export type AdminComponentOption = AdminRelationOption & {
  familyId: string;
  family: AdminRelationOption;
};

export type AdminUnitOption = AdminRelationOption & {
  code: string;
};

export type AdminComponentRow = AdminCatalogBaseRow & {
  kind: "componente";
  familyId: string;
  name: string;
  description: string | null;
  iconKey: CatalogIconKey;
  family: AdminRelationOption;
};

export type AdminVariantRow = AdminCatalogBaseRow & {
  kind: "variante";
  componentId: string;
  fabtekCode: string;
  oracleSapioCode: string | null;
  datasheetUrl: string | null;
  description: string;
  diameter: string | null;
  material: string;
  connection: string;
  unitOfMeasureId: string;
  trackInventory: boolean;
  component: AdminComponentOption;
  unitOfMeasure: AdminUnitOption;
  categories: AdminCategoryOption[];
};

export type AdminCatalogRow =
  | AdminCategoryRow
  | AdminFamilyRow
  | AdminComponentRow
  | AdminVariantRow;

export type AdminCatalogPage = {
  items: AdminCatalogRow[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminCatalogFormOptions = {
  categories: AdminCategoryOption[];
  families: AdminRelationOption[];
  components: AdminComponentOption[];
  unitsOfMeasure: AdminUnitOption[];
};

export class AdminCatalogDataError extends Error {
  constructor() {
    super("Il catalogo non è disponibile in questo momento.");
    this.name = "AdminCatalogDataError";
  }
}

type OrderableQuery<T> = {
  order(column: string, options?: OrderOptions): T;
};

export function applyCatalogVariantOrdering<T extends OrderableQuery<T>>(
  query: T,
): T {
  return query.order("sort_order").order("fabtek_code");
}

async function defaultCreateClient(): Promise<AdminCatalogClient> {
  const { createClient } = await import("../supabase/server.ts");
  return await createClient() as unknown as AdminCatalogClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (Array.isArray(value)) return value.find(isRecord) ?? null;
  return null;
}

function iconKey(value: unknown): CatalogIconKey | null {
  return typeof value === "string" && CATALOG_ICON_KEY_SET.has(value)
    ? value as CatalogIconKey
    : null;
}

function relationOption(value: unknown): AdminRelationOption | null {
  const row = firstRecord(value);
  if (!row) return null;
  const id = text(row.id);
  const name = text(row.name);
  return id && name && typeof row.is_active === "boolean"
    ? { id, name, isActive: row.is_active }
    : null;
}

function categoryOption(value: unknown): AdminCategoryOption | null {
  if (!isRecord(value)) return null;
  const base = relationOption(value);
  const code = text(value.code);
  return base && code ? { ...base, code } : null;
}

function componentOption(value: unknown): AdminComponentOption | null {
  const row = firstRecord(value);
  if (!row) return null;
  const base = relationOption(row);
  const family = relationOption(row.family);
  const familyId = text(row.family_id) ?? family?.id ?? null;
  return base && familyId && family
    ? { ...base, familyId, family }
    : null;
}

function unitOption(value: unknown): AdminUnitOption | null {
  const row = firstRecord(value);
  if (!row) return null;
  const base = relationOption(row);
  const code = text(row.code);
  return base && code ? { ...base, code } : null;
}

function baseRow(value: Record<string, unknown>): AdminCatalogBaseRow | null {
  const id = text(value.id);
  const sortOrder = integer(value.sort_order);
  return id && sortOrder !== null && typeof value.is_active === "boolean"
    ? { id, sortOrder, isActive: value.is_active }
    : null;
}

function mapCategory(value: unknown): AdminCategoryRow | null {
  if (!isRecord(value)) return null;
  const base = baseRow(value);
  const code = text(value.code);
  const name = text(value.name);
  const mappedIconKey = iconKey(value.icon_key);
  return base && code && name && mappedIconKey
    ? {
        kind: "categoria",
        ...base,
        code,
        name,
        subtitle: text(value.subtitle),
        iconKey: mappedIconKey,
      }
    : null;
}

function mapFamily(value: unknown): AdminFamilyRow | null {
  if (!isRecord(value)) return null;
  const base = baseRow(value);
  const name = text(value.name);
  const mappedIconKey = iconKey(value.icon_key);
  return base && name && mappedIconKey
    ? {
        kind: "famiglia",
        ...base,
        sourceCode: text(value.source_code),
        name,
        subtitle: text(value.subtitle),
        iconKey: mappedIconKey,
      }
    : null;
}

function mapComponent(value: unknown): AdminComponentRow | null {
  if (!isRecord(value)) return null;
  const base = baseRow(value);
  const familyId = text(value.family_id);
  const name = text(value.name);
  const mappedIconKey = iconKey(value.icon_key);
  const family = relationOption(value.family);
  return base && familyId && name && mappedIconKey && family
    ? {
        kind: "componente",
        ...base,
        familyId,
        name,
        description: text(value.description),
        iconKey: mappedIconKey,
        family,
      }
    : null;
}

function mapCategories(value: unknown): AdminCategoryOption[] | null {
  if (!Array.isArray(value)) return null;
  const categories = value.map((relation) => (
    isRecord(relation) ? categoryOption(relation.category) : null
  ));
  return categories.every((category) => category !== null)
    ? categories as AdminCategoryOption[]
    : null;
}

function mapVariant(value: unknown): AdminVariantRow | null {
  if (!isRecord(value)) return null;
  const base = baseRow(value);
  const componentId = text(value.component_id);
  const fabtekCode = text(value.fabtek_code);
  const description = text(value.description);
  const material = text(value.material);
  const connection = text(value.connection);
  const unitOfMeasureId = text(value.unit_of_measure_id);
  const component = componentOption(value.component);
  const unitOfMeasure = unitOption(value.unit_of_measure);
  const categories = mapCategories(value.categories);
  return base
    && componentId
    && fabtekCode
    && description
    && material
    && connection
    && unitOfMeasureId
    && typeof value.track_inventory === "boolean"
    && component
    && unitOfMeasure
    && categories
    ? {
        kind: "variante",
        ...base,
        componentId,
        fabtekCode,
        oracleSapioCode: text(value.oracle_sapio_code),
        datasheetUrl: text(value.datasheet_url),
        description,
        diameter: text(value.diameter),
        material,
        connection,
        unitOfMeasureId,
        trackInventory: value.track_inventory,
        component,
        unitOfMeasure,
        categories,
      }
    : null;
}

function mapRows(tab: AdminCatalogTab, rows: unknown): AdminCatalogRow[] {
  if (!Array.isArray(rows)) throw new AdminCatalogDataError();
  const mapped: (AdminCatalogRow | null)[] = rows.map((row) => {
    switch (tab) {
      case "categorie":
        return mapCategory(row);
      case "famiglie":
        return mapFamily(row);
      case "componenti":
        return mapComponent(row);
      case "varianti":
        return mapVariant(row);
    }
  });
  if (mapped.some((row) => row === null)) throw new AdminCatalogDataError();
  return mapped as AdminCatalogRow[];
}

function escapePostgrestSearchPattern(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/[%_*]/gu, "\\$&");
  return `"%${escaped}%"`;
}

function normalizePage(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : 1;
}

function clampPage(page: number, total: number): number {
  return total > 0 ? Math.min(page, Math.ceil(total / PAGE_SIZE)) : 1;
}

function tableConfiguration(tab: AdminCatalogTab) {
  switch (tab) {
    case "categorie":
      return {
        table: TABLE_BY_TAB.categorie,
        select: CATEGORY_SELECT,
        searchColumns: ["code", "name", "subtitle"],
        orderColumns: ["sort_order", "name", "id"],
      };
    case "famiglie":
      return {
        table: TABLE_BY_TAB.famiglie,
        select: FAMILY_SELECT,
        searchColumns: ["source_code", "name", "subtitle"],
        orderColumns: ["sort_order", "name", "id"],
      };
    case "componenti":
      return {
        table: TABLE_BY_TAB.componenti,
        select: COMPONENT_SELECT,
        searchColumns: ["name", "description"],
        orderColumns: ["sort_order", "name", "id"],
      };
    case "varianti":
      return {
        table: TABLE_BY_TAB.varianti,
        select: VARIANT_SELECT,
        searchColumns: [
          "fabtek_code",
          "oracle_sapio_code",
          "description",
          "diameter",
          "material",
          "connection",
        ],
        orderColumns: ["sort_order", "fabtek_code", "id"],
      };
  }
}

function unavailable(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "CATALOG_UNAVAILABLE",
      message: "Il catalogo non è disponibile in questo momento.",
    },
  };
}

function invalidInput(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "CATALOG_INPUT_INVALID",
      message: "Controlla i dati del catalogo inseriti.",
    },
  };
}

function notFound(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "CATALOG_ENTITY_NOT_FOUND",
      message: "La voce del catalogo non è disponibile.",
    },
  };
}

function errorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : null;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

function mutationError(
  error: unknown,
  operation: "save" | "delete" | "toggle",
): ActionResult<never> {
  switch (errorCode(error)) {
    case "23505":
      return {
        ok: false,
        error: {
          code: "CATALOG_ENTITY_DUPLICATE",
          message: "Esiste già una voce del catalogo con questi dati.",
        },
      };
    case "23503":
      return operation === "delete"
        ? {
            ok: false,
            error: {
              code: "CATALOG_ENTITY_REFERENCED",
              message: "La voce è utilizzata e non può essere eliminata.",
            },
          }
        : {
            ok: false,
            error: {
              code: "CATALOG_RELATION_INVALID",
              message: "La relazione selezionata non è disponibile.",
            },
          };
    case "P0002":
    case "PGRST116":
      return notFound();
    case "22023":
    case "23514":
      return invalidInput();
    case "42501":
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Operazione non consentita." },
      };
    default:
      return unavailable();
  }
}

function rowId(data: unknown): string | null {
  const row = firstRecord(data);
  const id = row ? text(row.id) : text(data);
  return id && UUID_PATTERN.test(id) ? id : null;
}

export async function getAdminCatalogPage(
  query: AdminCatalogListQuery,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<AdminCatalogPage> {
  const createClient = dependencies.createClient ?? defaultCreateClient;
  const client = await createClient();
  const configuration = tableConfiguration(query.tab);
  const normalizedSearch = typeof query.query === "string"
    ? query.query.trim().slice(0, MAX_QUERY_LENGTH)
    : "";
  let page = getSafePaginationRange(normalizePage(query.page), PAGE_SIZE).page;

  async function loadPage(targetPage: number): Promise<QueryResponse> {
    let catalogQuery = client
      .from(configuration.table)
      .select(configuration.select, { count: "exact" });

    if (query.status === "attivi") {
      catalogQuery = catalogQuery.eq("is_active", true);
    } else if (query.status === "inattivi") {
      catalogQuery = catalogQuery.eq("is_active", false);
    }

    if (normalizedSearch) {
      const pattern = escapePostgrestSearchPattern(normalizedSearch);
      catalogQuery = catalogQuery.or(
        configuration.searchColumns
          .map((column) => `${column}.ilike.${pattern}`)
          .join(","),
      );
    }

    for (const column of configuration.orderColumns) {
      catalogQuery = catalogQuery.order(column);
    }

    const range = getSafePaginationRange(targetPage, PAGE_SIZE);
    return catalogQuery.range(range.from, range.to);
  }

  let response = await loadPage(page);
  let total: number;

  if (errorCode(response.error) === "PGRST103") {
    response = await loadPage(1);
    if (
      response.error
      || !Array.isArray(response.data)
      || !isNonNegativeSafeInteger(response.count)
    ) {
      throw new AdminCatalogDataError();
    }
    total = response.count;
    page = clampPage(page, total);
    if (page !== 1) {
      response = await loadPage(page);
      if (response.error || !Array.isArray(response.data)) {
        throw new AdminCatalogDataError();
      }
    }
  } else {
    if (
      response.error
      || !Array.isArray(response.data)
      || !isNonNegativeSafeInteger(response.count)
    ) {
      throw new AdminCatalogDataError();
    }

    total = response.count;
    const clampedPage = clampPage(page, total);
    if (clampedPage !== page) {
      page = clampedPage;
      response = await loadPage(page);
      if (response.error || !Array.isArray(response.data)) {
        throw new AdminCatalogDataError();
      }
    }
  }

  return {
    items: mapRows(query.tab, response.data),
    page,
    pageSize: PAGE_SIZE,
    total,
  };
}

export async function getAdminComponentVariants(
  componentId: string,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<AdminVariantRow[]> {
  if (!UUID_PATTERN.test(componentId)) throw new AdminCatalogDataError();
  const createClient = dependencies.createClient ?? defaultCreateClient;
  const client = await createClient();
  const response = await applyCatalogVariantOrdering(
    client.from("item_variants").select(VARIANT_SELECT).eq("component_id", componentId),
  );
  if (response.error || !Array.isArray(response.data)) throw new AdminCatalogDataError();
  return mapRows("varianti", response.data) as AdminVariantRow[];
}

async function loadOptions(
  loadPage: (from: number, to: number) => PromiseLike<QueryResponse>,
  mapper: (value: unknown) => AdminRelationOption | AdminCategoryOption | AdminComponentOption | AdminUnitOption | null,
): Promise<(AdminRelationOption | AdminCategoryOption | AdminComponentOption | AdminUnitOption)[]> {
  let rows: unknown[];
  try {
    rows = await collectPaginatedRows(async (from, to) => {
      const response = await loadPage(from, to);
      return {
        data: Array.isArray(response.data) ? response.data : null,
        error: response.error,
      };
    });
  } catch {
    throw new AdminCatalogDataError();
  }
  const options = rows.map(mapper);
  if (options.some((option) => option === null)) {
    throw new AdminCatalogDataError();
  }
  return options as (AdminRelationOption | AdminCategoryOption | AdminComponentOption | AdminUnitOption)[];
}

export async function getAdminCatalogFormOptions(
  tab: AdminCatalogTab,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<AdminCatalogFormOptions> {
  const result: AdminCatalogFormOptions = {
    categories: [],
    families: [],
    components: [],
    unitsOfMeasure: [],
  };
  if (tab === "categorie" || tab === "famiglie") return result;

  const createClient = dependencies.createClient ?? defaultCreateClient;
  const client = await createClient();

  if (tab === "componenti") {
    const [categories, families, unitsOfMeasure] = await Promise.all([
      loadOptions(
        (from, to) => client.from("categories").select("id, code, name, is_active")
          .order("sort_order").order("name").order("id").range(from, to),
        categoryOption,
      ),
      loadOptions(
        (from, to) => client.from("families").select("id, name, is_active")
          .order("sort_order").order("name").order("id").range(from, to),
        relationOption,
      ),
      loadOptions(
        (from, to) => client.from("units_of_measure").select("id, code, name, is_active")
          .order("name").order("id").range(from, to),
        unitOption,
      ),
    ]);
    return {
      categories: categories as AdminCategoryOption[],
      families: families as AdminRelationOption[],
      components: [],
      unitsOfMeasure: unitsOfMeasure as AdminUnitOption[],
    };
  }

  const [categories, families, components, unitsOfMeasure] = await Promise.all([
    loadOptions(
      (from, to) => client
        .from("categories")
        .select("id, code, name, is_active")
        .order("sort_order")
        .order("name")
        .order("id")
        .range(from, to),
      categoryOption,
    ),
    loadOptions(
      (from, to) => client
        .from("families")
        .select("id, name, is_active")
        .order("sort_order")
        .order("name")
        .order("id")
        .range(from, to),
      relationOption,
    ),
    loadOptions(
      (from, to) => client
        .from("components")
        .select(COMPONENT_OPTION_SELECT)
        .order("sort_order")
        .order("name")
        .order("id")
        .range(from, to),
      componentOption,
    ),
    loadOptions(
      (from, to) => client
        .from("units_of_measure")
        .select("id, code, name, is_active")
        .order("name")
        .order("id")
        .range(from, to),
      unitOption,
    ),
  ]);

  return {
    categories: categories as AdminCategoryOption[],
    families: families as AdminRelationOption[],
    components: components as AdminComponentOption[],
    unitsOfMeasure: unitsOfMeasure as AdminUnitOption[],
  };
}

async function saveSingleRow(
  table: "categories" | "families" | "components" | "units_of_measure",
  id: string | null,
  payload: Record<string, unknown>,
  dependencies: Partial<AdminCatalogDependencies>,
): Promise<ActionResult<CatalogMutationResult>> {
  try {
    const createClient = dependencies.createClient ?? defaultCreateClient;
    const client = await createClient();
    let mutation = id === null
      ? client.from(table).insert(payload)
      : client.from(table).update(payload).eq("id", id);
    mutation = mutation.select("id");
    const response = await mutation.maybeSingle();
    if (response.error) return mutationError(response.error, "save");

    const savedId = rowId(response.data);
    if (!savedId) return id === null ? unavailable() : notFound();
    return { ok: true, data: { id: savedId } };
  } catch (error) {
    return mutationError(error, "save");
  }
}

export function saveCategory(
  input: CategoryInput,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<ActionResult<CatalogMutationResult>> {
  return saveSingleRow("categories", input.id, {
    code: input.code,
    name: input.name,
    subtitle: input.subtitle,
    icon_key: input.iconKey,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  }, dependencies);
}

export function saveFamily(
  input: FamilyInput,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<ActionResult<CatalogMutationResult>> {
  return saveSingleRow("families", input.id, {
    source_code: input.sourceCode,
    name: input.name,
    subtitle: input.subtitle,
    icon_key: input.iconKey,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  }, dependencies);
}

export function saveComponent(
  input: ComponentInput,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<ActionResult<CatalogMutationResult>> {
  return saveSingleRow("components", input.id, {
    family_id: input.familyId,
    name: input.name,
    description: input.description,
    icon_key: input.iconKey,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  }, dependencies);
}

export function saveUnit(
  input: UnitInput,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<ActionResult<CatalogMutationResult>> {
  return saveSingleRow("units_of_measure", null, {
    code: input.code,
    name: input.name,
    allows_fraction: input.allowsFraction,
    is_active: true,
  }, dependencies);
}

export async function saveVariant(
  input: VariantInput,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<ActionResult<CatalogMutationResult>> {
  try {
    const createClient = dependencies.createClient ?? defaultCreateClient;
    const client = await createClient();
    const response = await client.rpc("save_catalog_variant", {
      p_id: input.id,
      p_component_id: input.componentId,
      p_fabtek_code: input.fabtekCode,
      p_oracle_sapio_code: input.oracleSapioCode,
      p_datasheet_url: input.datasheetUrl,
      p_description: input.description,
      p_diameter: input.diameter,
      p_material: input.material,
      p_connection: input.connection,
      p_unit_of_measure_id: input.unitOfMeasureId,
      p_category_ids: input.categoryIds,
      p_track_inventory: input.trackInventory,
      p_sort_order: input.sortOrder,
      p_is_active: input.isActive,
    });
    if (response.error) return mutationError(response.error, "save");

    const id = rowId(response.data);
    return id ? { ok: true, data: { id } } : unavailable();
  } catch (error) {
    return mutationError(error, "save");
  }
}

function resolveEntityTable(tab: AdminCatalogTab): CatalogEntityTable | null {
  return TABLE_BY_TAB[tab] ?? null;
}

export async function setCatalogEntityActive(
  tab: AdminCatalogTab,
  id: string,
  isActive: boolean,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<ActionResult<CatalogMutationResult>> {
  const table = resolveEntityTable(tab);
  if (!table || !UUID_PATTERN.test(id) || typeof isActive !== "boolean") {
    return invalidInput();
  }

  try {
    const createClient = dependencies.createClient ?? defaultCreateClient;
    const client = await createClient();
    const response = await client
      .from(table)
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (response.error) return mutationError(response.error, "toggle");

    const updatedId = rowId(response.data);
    return updatedId ? { ok: true, data: { id: updatedId } } : notFound();
  } catch (error) {
    return mutationError(error, "toggle");
  }
}

export async function deleteCatalogEntity(
  tab: AdminCatalogTab,
  id: string,
  dependencies: Partial<AdminCatalogDependencies> = {},
): Promise<ActionResult<CatalogMutationResult>> {
  const table = resolveEntityTable(tab);
  if (!table || !UUID_PATTERN.test(id)) return invalidInput();

  try {
    const createClient = dependencies.createClient ?? defaultCreateClient;
    const client = await createClient();
    const response = await client
      .from(table)
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (response.error) return mutationError(response.error, "delete");

    const deletedId = rowId(response.data);
    return deletedId ? { ok: true, data: { id: deletedId } } : notFound();
  } catch (error) {
    return mutationError(error, "delete");
  }
}
