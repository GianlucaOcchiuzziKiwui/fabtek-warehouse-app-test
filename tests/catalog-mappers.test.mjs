import assert from "node:assert/strict";
import test from "node:test";

import {
  getAvailabilityLabel,
  mapCatalogRows,
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

test("renders untracked variants as unlimited without a fake quantity", () => {
  assert.deepEqual(
    getAvailabilityLabel({
      trackInventory: false,
      availableQuantity: null,
      lowStockThreshold: null,
      status: "unlimited",
    }),
    { label: "Disponibilità non limitata", tone: "neutral" },
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
