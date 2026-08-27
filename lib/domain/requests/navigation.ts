export const REQUEST_HEADER_PATH = "/richieste/nuova";
export const REQUEST_MATERIALS_PATH = "/richieste/nuova/materiali";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CatalogSelection = {
  variantId?: string;
  categoryId?: string;
};

function buildRequestStepHref(path: string, selection?: CatalogSelection) {
  const variantId = selection?.variantId?.trim();
  const categoryId = selection?.categoryId?.trim();
  if (
    !variantId
    || !categoryId
    || !UUID_PATTERN.test(variantId)
    || !UUID_PATTERN.test(categoryId)
  ) {
    return path;
  }

  const params = new URLSearchParams({ variantId, categoryId });
  return `${path}?${params}`;
}

export function buildRequestHeaderHref(selection?: CatalogSelection) {
  return buildRequestStepHref(REQUEST_HEADER_PATH, selection);
}

export function buildRequestMaterialsHref(selection?: CatalogSelection) {
  return buildRequestStepHref(REQUEST_MATERIALS_PATH, selection);
}
