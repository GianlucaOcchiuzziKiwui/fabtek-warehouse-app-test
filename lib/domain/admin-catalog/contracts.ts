import type { CatalogIconKey } from "../../data/catalog-mappers.ts";

export type AdminCatalogTab =
  | "categorie"
  | "famiglie"
  | "componenti"
  | "varianti";

export type AdminCatalogStatusFilter = "attivi" | "inattivi" | "tutti";

export type AdminCatalogListQuery = {
  tab: AdminCatalogTab;
  status: AdminCatalogStatusFilter;
  query: string;
  page: number;
};

type CatalogEntityInput = {
  id: string | null;
  sortOrder: number;
  isActive: boolean;
};

type CatalogIconInput = {
  iconKey: CatalogIconKey;
};

export type CategoryInput = CatalogEntityInput & CatalogIconInput & {
  code: string;
  name: string;
  subtitle: string | null;
};

export type FamilyInput = CatalogEntityInput & CatalogIconInput & {
  sourceCode: string | null;
  name: string;
  subtitle: string | null;
};

export type ComponentInput = CatalogEntityInput & CatalogIconInput & {
  familyId: string;
  name: string;
  description: string | null;
};

export type VariantInput = CatalogEntityInput & {
  componentId: string;
  fabtekCode: string;
  oracleSapioCode: string | null;
  description: string;
  diameter: string | null;
  material: string;
  connection: string;
  unitOfMeasureId: string;
  categoryIds: string[];
  trackInventory: boolean;
};

export type CatalogMutationResult = {
  id: string;
};
