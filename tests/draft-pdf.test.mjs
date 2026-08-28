import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        format: "module",
        url: "data:text/javascript,export%20{}",
      };
    }
    if (specifier.startsWith("@/")) {
      return {
        shortCircuit: true,
        url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { createDraftPdf } = await import("../lib/domain/documents/draft-pdf.ts");
const { mapCatalogRows, mapCatalogSelections } = await import("../lib/data/catalog-mappers.ts");
const { mapDraftPdfDocument } = await import("../lib/pdf/mappers.ts");

const VARIANT_ID = "20000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";

function validInput(overrides = {}) {
  return {
    clientRequestId: "10000000-0000-4000-8000-000000000001",
    project: " Progetto 21 ",
    toolLine: " Linea A ",
    utilities: " Aria compressa ",
    notes: " Consegna urgente ",
    lines: [{
      itemVariantId: VARIANT_ID,
      categoryId: CATEGORY_ID,
      quantity: 2,
    }],
    ...overrides,
  };
}

function resolvedSelection(overrides = {}) {
  return {
    itemVariantId: VARIANT_ID,
    categoryId: CATEGORY_ID,
    variant: {
      id: VARIANT_ID,
      fabtekCode: "FT-001",
      oracleSapioCode: "OR-900",
      description: "Tubo flessibile PTFE",
      diameter: "DN10",
      material: "PTFE",
      connection: "1/2 NPT",
      technicalAttributes: {},
      component: { id: "40000000-0000-4000-8000-000000000001", name: "Tubo", iconKey: "component" },
      family: { id: "50000000-0000-4000-8000-000000000001", name: "Flessibili", iconKey: "boxes" },
      unitOfMeasure: { code: "m", name: "Metri" },
      categories: [{ id: CATEGORY_ID, name: "Gas", iconKey: "factory" }],
      supplier: null,
      datasheet: null,
      stock: { trackInventory: true, availableQuantity: 12, lowStockThreshold: 2, status: "available" },
    },
    ...overrides,
  };
}

test("builds a draft PDF from validated quantities and server catalog details", async () => {
  const rendered = [];
  const result = await createDraftPdf(validInput(), {
    requesterName: "Mario Rossi",
    now: () => new Date("2026-08-28T10:00:00Z"),
    loadSelections: async () => [resolvedSelection()],
    render: async (document) => {
      rendered.push(document);
      return Buffer.from("%PDF-test");
    },
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      buffer: Buffer.from("%PDF-test"),
      filename: "fabtek-distinta-bozza.pdf",
    },
  });
  assert.equal(rendered[0].kind, "draft");
  assert.equal(rendered[0].lines[0].requestedQuantity, 2);
  assert.equal(rendered[0].lines[0].fabtekCode, "FT-001");
  assert.equal(rendered[0].documentDateLabel, "28/08/2026");
});

test("keeps Oracle/Sapio loaded by the catalog selection query in the draft PDF DTO", async () => {
  const catalogSource = await readFile("lib/data/catalog.ts", "utf8");
  const selectionQuery = catalogSource.match(
    /const CATALOG_SELECTION_SELECT = `([\s\S]*?)`;/u,
  )?.[1];
  assert.match(selectionQuery ?? "", /^\s*oracle_sapio_code,$/mu);

  const variants = mapCatalogRows([{
    id: VARIANT_ID,
    fabtek_code: "FT-001",
    oracle_sapio_code: "OR-900",
    description: "Tubo flessibile PTFE",
    diameter: "DN10",
    material: "PTFE",
    connection: "1/2 NPT",
    technical_attributes: {},
    component: {
      id: "40000000-0000-4000-8000-000000000001",
      name: "Tubo",
      icon_key: "component",
      family: {
        id: "50000000-0000-4000-8000-000000000001",
        name: "Flessibili",
        icon_key: "boxes",
      },
    },
    unit_of_measure: { code: "m", name: "Metri" },
    categories: [{
      category: { id: CATEGORY_ID, name: "Gas", icon_key: "factory" },
    }],
    suppliers: [],
    assets: [],
  }], [{
    item_variant_id: VARIANT_ID,
    track_inventory: false,
    available_quantity: null,
    low_stock_threshold: null,
    stock_status: "unlimited",
  }]);
  const selections = mapCatalogSelections([{
    itemVariantId: VARIANT_ID,
    categoryId: CATEGORY_ID,
  }], variants);
  const document = mapDraftPdfDocument(
    validInput(),
    "Mario Rossi",
    selections,
    new Date("2026-08-28T10:00:00Z"),
  );

  assert.equal(document.lines[0].oracleSapioCode, "OR-900");
});

test("rejects a draft when a catalog line is no longer available", async () => {
  let rendered = false;
  const result = await createDraftPdf(validInput(), {
    requesterName: "Mario Rossi",
    now: () => new Date("2026-08-28T10:00:00Z"),
    loadSelections: async () => [],
    render: async () => {
      rendered = true;
      return Buffer.from("%PDF-test");
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "INVALID_REQUEST_LINES",
      message: "Uno o più articoli non sono più disponibili.",
    },
  });
  assert.equal(rendered, false);
});

test("does not load or render a draft with an invalid payload", async () => {
  let loaded = false;
  let rendered = false;
  const result = await createDraftPdf(validInput({ lines: [] }), {
    requesterName: "Mario Rossi",
    now: () => new Date("2026-08-28T10:00:00Z"),
    loadSelections: async () => {
      loaded = true;
      return [resolvedSelection()];
    },
    render: async () => {
      rendered = true;
      return Buffer.from("%PDF-test");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "EMPTY_REQUEST");
  assert.equal(loaded, false);
  assert.equal(rendered, false);
});
