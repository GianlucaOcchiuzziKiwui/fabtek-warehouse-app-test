"use server";

import { requirePermission } from "@/lib/auth/current-profile";
import {
  deleteCatalogEntity,
  saveCategory,
  saveComponent,
  saveFamily,
  saveUnit,
  saveVariant,
  setCatalogEntityActive,
} from "@/lib/data/admin-catalog";
import type { ActionResult } from "@/lib/domain/action-result";
import type {
  AdminCatalogTab,
  CatalogMutationResult,
} from "@/lib/domain/admin-catalog/contracts";
import {
  AdminCatalogValidationError,
  parseCategoryInput,
  parseComponentInput,
  parseFamilyInput,
  parseUnitInput,
  parseVariantInput,
} from "@/lib/domain/admin-catalog/validation";
import { revalidatePath } from "next/cache";

const CATALOG_ENTITIES = new Set<AdminCatalogTab>([
  "categorie",
  "famiglie",
  "componenti",
  "varianti",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CatalogEntityReference = {
  entity: AdminCatalogTab;
  id: string;
};

function invalidInput(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "CATALOG_INPUT_INVALID",
      message: "Controlla i dati del catalogo inseriti.",
    },
  };
}

function parseEntityReference(value: unknown): CatalogEntityReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AdminCatalogValidationError();
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.entity !== "string"
    || !CATALOG_ENTITIES.has(input.entity as AdminCatalogTab)
    || typeof input.id !== "string"
    || !UUID_PATTERN.test(input.id)
  ) {
    throw new AdminCatalogValidationError();
  }
  return {
    entity: input.entity as AdminCatalogTab,
    id: input.id.toLowerCase(),
  };
}

function validationResult(error: unknown): ActionResult<never> | null {
  return error instanceof AdminCatalogValidationError ? invalidInput() : null;
}

function revalidateCatalog(result: ActionResult<CatalogMutationResult>) {
  if (!result.ok) return;
  revalidatePath("/admin/catalogo");
  revalidatePath("/catalogo");
}

export async function saveCategoryAction(
  input: unknown,
): Promise<ActionResult<CatalogMutationResult>> {
  await requirePermission("catalog:manage");
  try {
    const result = await saveCategory(parseCategoryInput(input));
    revalidateCatalog(result);
    return result;
  } catch (error) {
    const result = validationResult(error);
    if (result) return result;
    throw error;
  }
}

export async function saveFamilyAction(
  input: unknown,
): Promise<ActionResult<CatalogMutationResult>> {
  await requirePermission("catalog:manage");
  try {
    const result = await saveFamily(parseFamilyInput(input));
    revalidateCatalog(result);
    return result;
  } catch (error) {
    const result = validationResult(error);
    if (result) return result;
    throw error;
  }
}

export async function saveComponentAction(
  input: unknown,
): Promise<ActionResult<CatalogMutationResult>> {
  await requirePermission("catalog:manage");
  try {
    const result = await saveComponent(parseComponentInput(input));
    revalidateCatalog(result);
    return result;
  } catch (error) {
    const result = validationResult(error);
    if (result) return result;
    throw error;
  }
}

export async function saveUnitAction(
  input: unknown,
): Promise<ActionResult<CatalogMutationResult>> {
  await requirePermission("catalog:manage");
  try {
    const result = await saveUnit(parseUnitInput(input));
    revalidateCatalog(result);
    return result;
  } catch (error) {
    const result = validationResult(error);
    if (result) return result;
    throw error;
  }
}

export async function saveVariantAction(
  input: unknown,
): Promise<ActionResult<CatalogMutationResult>> {
  await requirePermission("catalog:manage");
  try {
    const result = await saveVariant(parseVariantInput(input));
    revalidateCatalog(result);
    return result;
  } catch (error) {
    const result = validationResult(error);
    if (result) return result;
    throw error;
  }
}

export async function setCatalogEntityActiveAction(
  input: unknown,
): Promise<ActionResult<CatalogMutationResult>> {
  await requirePermission("catalog:manage");
  try {
    const reference = parseEntityReference(input);
    if (
      typeof input !== "object"
      || input === null
      || typeof (input as Record<string, unknown>).isActive !== "boolean"
    ) {
      return invalidInput();
    }
    const result = await setCatalogEntityActive(
      reference.entity,
      reference.id,
      (input as Record<string, unknown>).isActive as boolean,
    );
    revalidateCatalog(result);
    return result;
  } catch (error) {
    const result = validationResult(error);
    if (result) return result;
    throw error;
  }
}

export async function deleteCatalogEntityAction(
  input: unknown,
): Promise<ActionResult<CatalogMutationResult>> {
  await requirePermission("catalog:manage");
  try {
    const reference = parseEntityReference(input);
    const result = await deleteCatalogEntity(reference.entity, reference.id);
    revalidateCatalog(result);
    return result;
  } catch (error) {
    const result = validationResult(error);
    if (result) return result;
    throw error;
  }
}
