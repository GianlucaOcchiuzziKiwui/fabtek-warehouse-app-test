import {
  CATALOG_ICON_KEYS,
  type CatalogIconKey,
} from "../../data/catalog-mappers.ts";
import type {
  AdminCatalogListQuery,
  AdminCatalogStatusFilter,
  AdminCatalogTab,
  CategoryInput,
  ComponentInput,
  FamilyInput,
  UnitInput,
  VariantInput,
} from "./contracts.ts";

const ADMIN_CATALOG_TABS = new Set<AdminCatalogTab>([
  "categorie",
  "famiglie",
  "componenti",
  "varianti",
]);
const ADMIN_CATALOG_STATUS_FILTERS = new Set<AdminCatalogStatusFilter>([
  "attivi",
  "inattivi",
  "tutti",
]);
const CATALOG_ICON_KEY_SET = new Set<string>(CATALOG_ICON_KEYS);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_SORT_ORDER = -1_000_000;
const MAX_SORT_ORDER = 1_000_000;

export class AdminCatalogValidationError extends Error {
  readonly code = "INVALID_ADMIN_CATALOG_INPUT" as const;

  constructor() {
    super("Controlla i dati del catalogo inseriti.");
    this.name = "AdminCatalogValidationError";
  }
}

function invalid(): never {
  throw new AdminCatalogValidationError();
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid();
  }
  return value as Record<string, unknown>;
}

function queryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function requiredText(value: unknown, maxLength?: number): string {
  if (typeof value !== "string") invalid();
  const normalized = value.trim();
  if (
    !normalized
    || (maxLength !== undefined && Array.from(normalized).length > maxLength)
  ) {
    invalid();
  }
  return normalized;
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") invalid();
  return value.trim() || null;
}

function uuid(value: unknown): string {
  const normalized = requiredText(value);
  if (!UUID_PATTERN.test(normalized)) invalid();
  return normalized.toLowerCase();
}

function nullableUuid(value: unknown): string | null {
  if (value === null) return null;
  return uuid(value);
}

function integer(value: unknown): number {
  let normalized: number;
  if (typeof value === "number") {
    normalized = value;
  } else if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    normalized = Number(value.trim());
  } else {
    invalid();
  }

  if (
    !Number.isSafeInteger(normalized)
    || normalized < MIN_SORT_ORDER
    || normalized > MAX_SORT_ORDER
  ) {
    invalid();
  }
  return normalized;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function iconKey(value: unknown): CatalogIconKey {
  if (typeof value !== "string" || !CATALOG_ICON_KEY_SET.has(value)) invalid();
  return value as CatalogIconKey;
}

function baseEntityInput(value: Record<string, unknown>) {
  return {
    id: nullableUuid(value.id),
    sortOrder: integer(value.sortOrder),
    isActive: boolean(value.isActive),
  };
}

export function parseAdminCatalogListQuery(value: unknown): AdminCatalogListQuery {
  const input = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const tabValue = queryValue(input.tab);
  const statusValue = queryValue(input.status);
  const rawQuery = queryValue(input.q) ?? queryValue(input.query);
  const rawPage = queryValue(input.page);
  const page = rawPage && /^\d+$/.test(rawPage.trim())
    ? Number(rawPage.trim())
    : 1;

  return {
    tab: tabValue && ADMIN_CATALOG_TABS.has(tabValue as AdminCatalogTab)
      ? tabValue as AdminCatalogTab
      : "categorie",
    status: statusValue
      && ADMIN_CATALOG_STATUS_FILTERS.has(statusValue as AdminCatalogStatusFilter)
      ? statusValue as AdminCatalogStatusFilter
      : "attivi",
    query: rawQuery?.trim() ?? "",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function parseCategoryInput(value: unknown): CategoryInput {
  const input = record(value);
  return {
    ...baseEntityInput(input),
    code: requiredText(input.code),
    name: requiredText(input.name, 160),
    subtitle: optionalText(input.subtitle),
    iconKey: iconKey(input.iconKey),
  };
}

export function parseFamilyInput(value: unknown): FamilyInput {
  const input = record(value);
  return {
    ...baseEntityInput(input),
    sourceCode: optionalText(input.sourceCode),
    name: requiredText(input.name, 160),
    subtitle: optionalText(input.subtitle),
    iconKey: iconKey(input.iconKey),
  };
}

export function parseComponentInput(value: unknown): ComponentInput {
  const input = record(value);
  return {
    ...baseEntityInput(input),
    familyId: uuid(input.familyId),
    name: requiredText(input.name, 200),
    description: optionalText(input.description),
    iconKey: iconKey(input.iconKey),
  };
}

export function parseUnitInput(value: unknown): UnitInput {
  const input = record(value);
  return {
    code: requiredText(input.code, 40),
    name: requiredText(input.name, 120),
    allowsFraction: boolean(input.allowsFraction),
  };
}

export function parseVariantInput(value: unknown): VariantInput {
  const input = record(value);
  if (!Array.isArray(input.categoryIds) || input.categoryIds.length === 0) {
    invalid();
  }
  const categoryIds = Array.from(input.categoryIds, uuid);
  if (new Set(categoryIds).size !== categoryIds.length) invalid();

  return {
    ...baseEntityInput(input),
    componentId: uuid(input.componentId),
    fabtekCode: requiredText(input.fabtekCode),
    oracleSapioCode: optionalText(input.oracleSapioCode),
    description: requiredText(input.description),
    diameter: optionalText(input.diameter),
    material: requiredText(input.material),
    connection: requiredText(input.connection),
    unitOfMeasureId: uuid(input.unitOfMeasureId),
    categoryIds,
    trackInventory: boolean(input.trackInventory),
  };
}
