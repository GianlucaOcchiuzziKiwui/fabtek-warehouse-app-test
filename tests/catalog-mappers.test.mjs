import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeCatalogFilters,
  getAvailabilityLabel,
  mapCatalogSelections,
  mapCatalogRows,
  normalizeCatalogSelectionInputs,
} from "../lib/data/catalog-mappers.ts";

function stock(status, availableQuantity) {
  return {
    trackInventory: true,
    availableQuantity,
    lowStockThreshold: 3,
    status,
  };
}

function row(overrides = {}) {
  return {
    id: "20000000-0000-0000-0000-000000000001",
    fabtek_code: "FT-001",
    oracle_sapio_code: null,
    description: "Tubo flessibile",
    diameter: "DN10",
    material: "PTFE",
    connection: "1/2 NPT",
    technical_attributes: { pressione: "10 bar" },
    component: {
      id: "40000000-0000-0000-0000-000000000001",
      name: "Tubi",
      family: {
        id: "50000000-0000-0000-0000-000000000001",
        name: "Flessibili",
      },
    },
    unit_of_measure: { code: "m", name: "Metri" },
    categories: [{
      category: {
        id: "30000000-0000-0000-0000-000000000001",
        name: "Gas",
      },
    }],
    suppliers: [],
    assets: [],
    ...overrides,
  };
}

test("renders untracked variants as available without a fake quantity", () => {
  assert.deepEqual(
    getAvailabilityLabel({
      trackInventory: false,
      availableQuantity: null,
      lowStockThreshold: null,
      status: "unlimited",
    }),
    { label: "disponibile", tone: "good" },
  );
});

test("maps tracked availability states", () => {
  assert.equal(getAvailabilityLabel(stock("available", 8)).label, "8 disponibili");
  assert.equal(getAvailabilityLabel(stock("low_stock", 2)).tone, "warning");
  assert.equal(getAvailabilityLabel(stock("out_of_stock", 0)).tone, "danger");
});

test("discards rows without an id or Fabtek code", () => {
  const mapped = mapCatalogRows([
    row({ id: null }),
    row({ fabtek_code: "" }),
    row(),
  ], []);

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].fabtekCode, "FT-001");
});

test("does not invent a supplier or datasheet when relations are empty", () => {
  const [mapped] = mapCatalogRows([row()], []);

  assert.equal(mapped.supplier, null);
  assert.equal(mapped.datasheet, null);
});

test("clears stale descendants when a parent catalog filter changes", () => {
  const filters = canonicalizeCatalogFilters({
    categoryId: "30000000-0000-0000-0000-000000000002",
    familyId: "50000000-0000-0000-0000-000000000001",
    componentId: "40000000-0000-0000-0000-000000000001",
    page: 4,
  }, {
    categories: [{
      id: "30000000-0000-0000-0000-000000000002",
      name: "Acqua",
    }],
    families: [{
      id: "50000000-0000-0000-0000-000000000002",
      name: "Valvole",
    }],
    components: [],
  });

  assert.deepEqual(filters, {
    categoryId: "30000000-0000-0000-0000-000000000002",
    familyId: undefined,
    componentId: undefined,
    page: 1,
  });
});

test("normalizes valid catalogue selection pairs and removes duplicates", () => {
  assert.deepEqual(normalizeCatalogSelectionInputs([
    {
      itemVariantId: "20000000-0000-0000-0000-000000000001",
      categoryId: "30000000-0000-0000-0000-000000000001",
    },
    {
      itemVariantId: "not-a-uuid",
      categoryId: "30000000-0000-0000-0000-000000000001",
    },
    {
      itemVariantId: "20000000-0000-0000-0000-000000000001",
      categoryId: "30000000-0000-0000-0000-000000000001",
    },
  ]), [{
    itemVariantId: "20000000-0000-0000-0000-000000000001",
    categoryId: "30000000-0000-0000-0000-000000000001",
  }]);
});

test("maps only exact requested variant and category pairs in request order", () => {
  const variants = mapCatalogRows([
    row(),
    row({
      id: "20000000-0000-0000-0000-000000000002",
      fabtek_code: "FT-002",
      categories: [{
        category: {
          id: "30000000-0000-0000-0000-000000000002",
          name: "Acqua",
        },
      }],
    }),
  ], []);
  const mapped = mapCatalogSelections([
    {
      itemVariantId: "20000000-0000-0000-0000-000000000002",
      categoryId: "30000000-0000-0000-0000-000000000002",
    },
    {
      itemVariantId: "20000000-0000-0000-0000-000000000001",
      categoryId: "30000000-0000-0000-0000-000000000002",
    },
    {
      itemVariantId: "20000000-0000-0000-0000-000000000001",
      categoryId: "30000000-0000-0000-0000-000000000001",
    },
  ], variants);

  assert.deepEqual(mapped.map((selection) => ({
    itemVariantId: selection.itemVariantId,
    categoryId: selection.categoryId,
    fabtekCode: selection.variant.fabtekCode,
  })), [
    {
      itemVariantId: "20000000-0000-0000-0000-000000000002",
      categoryId: "30000000-0000-0000-0000-000000000002",
      fabtekCode: "FT-002",
    },
    {
      itemVariantId: "20000000-0000-0000-0000-000000000001",
      categoryId: "30000000-0000-0000-0000-000000000001",
      fabtekCode: "FT-001",
    },
  ]);
});
