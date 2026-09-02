import assert from "node:assert/strict";
import test from "node:test";

import * as adminCatalogValidation from "../lib/domain/admin-catalog/validation.ts";

const {
  AdminCatalogValidationError,
  parseAdminCatalogListQuery,
  parseCategoryInput,
  parseComponentInput,
  parseFamilyInput,
  parseVariantInput,
} = adminCatalogValidation;

const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_CATEGORY_ID = "30000000-0000-4000-8000-000000000002";
const FAMILY_ID = "50000000-0000-4000-8000-000000000001";
const COMPONENT_ID = "40000000-0000-4000-8000-000000000001";
const UNIT_ID = "60000000-0000-4000-8000-000000000001";

function assertInvalid(parse, value) {
  assert.throws(
    () => parse(value),
    (error) => error instanceof AdminCatalogValidationError
      && error.code === "INVALID_ADMIN_CATALOG_INPUT",
  );
}

test("falls back to canonical list filters for invalid query values", () => {
  assert.deepEqual(parseAdminCatalogListQuery({
    tab: "fornitori",
    status: "archiviati",
    query: "  PTFE  ",
    page: "0",
  }), {
    tab: "categorie",
    status: "attivi",
    query: "PTFE",
    page: 1,
  });

  assert.deepEqual(parseAdminCatalogListQuery(null), {
    tab: "categorie",
    status: "attivi",
    query: "",
    page: 1,
  });
});

test("accepts canonical list filters and positive integer pages", () => {
  assert.deepEqual(parseAdminCatalogListQuery({
    tab: "varianti",
    status: "tutti",
    query: [" tubo ", "ignorato"],
    page: "3",
  }), {
    tab: "varianti",
    status: "tutti",
    query: "tubo",
    page: 3,
  });
});

test("reads search text from the canonical q URL parameter", () => {
  assert.deepEqual(parseAdminCatalogListQuery({ q: "  PTFE  " }), {
    tab: "categorie",
    status: "attivi",
    query: "PTFE",
    page: 1,
  });
});

test("normalizes category fields and empty optional values", () => {
  assert.deepEqual(parseCategoryInput({
    id: null,
    code: " GAS ",
    name: " Gas tecnici ",
    subtitle: " ",
    iconKey: "cylinder",
    sortOrder: "-2",
    isActive: true,
  }), {
    id: null,
    code: "GAS",
    name: "Gas tecnici",
    subtitle: null,
    iconKey: "cylinder",
    sortOrder: -2,
    isActive: true,
  });
});

test("normalizes family and component fields", () => {
  assert.deepEqual(parseFamilyInput({
    id: FAMILY_ID,
    sourceCode: " ",
    name: " Raccordi ",
    subtitle: " Linea sterile ",
    iconKey: "boxes",
    sortOrder: 7,
    isActive: false,
  }), {
    id: FAMILY_ID,
    sourceCode: null,
    name: "Raccordi",
    subtitle: "Linea sterile",
    iconKey: "boxes",
    sortOrder: 7,
    isActive: false,
  });

  assert.deepEqual(parseComponentInput({
    id: null,
    familyId: FAMILY_ID,
    name: " Valvole ",
    description: " ",
    iconKey: "wrench",
    sortOrder: "0",
    isActive: true,
  }), {
    id: null,
    familyId: FAMILY_ID,
    name: "Valvole",
    description: null,
    iconKey: "wrench",
    sortOrder: 0,
    isActive: true,
  });
});

test("normalizes the quick-create unit fields without inventing fractional support", () => {
  assert.deepEqual(adminCatalogValidation.parseUnitInput?.({
    code: " kg ",
    name: " Chilogrammi ",
    allowsFraction: false,
  }), {
    code: "kg",
    name: "Chilogrammi",
    allowsFraction: false,
  });
});

test("rejects malformed quick-create units", () => {
  for (const input of [
    { code: " ", name: "Pezzi", allowsFraction: false },
    { code: "PZ", name: " ", allowsFraction: false },
    { code: "PZ", name: "Pezzi", allowsFraction: "false" },
  ]) {
    assertInvalid(adminCatalogValidation.parseUnitInput, input);
  }
});

test("normalizes every variant field without inventing optional data", () => {
  assert.deepEqual(parseVariantInput({
    id: null,
    componentId: COMPONENT_ID,
    fabtekCode: " FT-001 ",
    oracleSapioCode: " ",
    datasheetUrl: " https://example.com/schede/ft-001.pdf ",
    description: " Tubo PTFE ",
    diameter: " ",
    material: " PTFE ",
    connection: " 1/2 NPT ",
    unitOfMeasureId: UNIT_ID,
    categoryIds: [CATEGORY_ID],
    trackInventory: false,
    sortOrder: "4",
    isActive: true,
  }), {
    id: null,
    componentId: COMPONENT_ID,
    fabtekCode: "FT-001",
    oracleSapioCode: null,
    datasheetUrl: "https://example.com/schede/ft-001.pdf",
    description: "Tubo PTFE",
    diameter: null,
    material: "PTFE",
    connection: "1/2 NPT",
    unitOfMeasureId: UNIT_ID,
    categoryIds: [CATEGORY_ID],
    trackInventory: false,
    sortOrder: 4,
    isActive: true,
  });
});

test("accepts only optional absolute HTTP or HTTPS datasheet URLs", () => {
  const base = {
    id: null,
    componentId: COMPONENT_ID,
    fabtekCode: "FT-001",
    oracleSapioCode: null,
    description: "Tubo PTFE",
    diameter: null,
    material: "PTFE",
    connection: "1/2 NPT",
    unitOfMeasureId: UNIT_ID,
    categoryIds: [CATEGORY_ID],
    trackInventory: false,
    sortOrder: 0,
    isActive: true,
  };

  assert.equal(parseVariantInput({ ...base, datasheetUrl: " " }).datasheetUrl, null);
  assert.equal(
    parseVariantInput({ ...base, datasheetUrl: "http://example.com/data.pdf" }).datasheetUrl,
    "http://example.com/data.pdf",
  );
  for (const datasheetUrl of [
    "ftp://example.com/data.pdf",
    "example.com/data.pdf",
    "/data.pdf",
    "https://",
  ]) {
    assertInvalid(parseVariantInput, { ...base, datasheetUrl });
  }
});

test("rejects malformed UUIDs and non-boolean flags", () => {
  assertInvalid(parseComponentInput, {
    id: null,
    familyId: "not-a-uuid",
    name: "Valvole",
    description: null,
    iconKey: "wrench",
    sortOrder: 0,
    isActive: true,
  });

  assertInvalid(parseCategoryInput, {
    id: null,
    code: "GAS",
    name: "Gas",
    subtitle: null,
    iconKey: "factory",
    sortOrder: 0,
    isActive: "true",
  });
});

test("rejects icons outside the shared catalog whitelist", () => {
  assertInvalid(parseCategoryInput, {
    id: null,
    code: "GAS",
    name: "Gas",
    subtitle: null,
    iconKey: "rocket",
    sortOrder: 0,
    isActive: true,
  });
});

test("rejects non-integer or out-of-range sort orders", () => {
  for (const sortOrder of ["1.5", 1_000_001, -1_000_001]) {
    assertInvalid(parseFamilyInput, {
      id: null,
      sourceCode: null,
      name: "Famiglia",
      subtitle: null,
      iconKey: "boxes",
      sortOrder,
      isActive: true,
    });
  }
});

test("enforces database-compatible entity name lengths", () => {
  assertInvalid(parseCategoryInput, {
    id: null,
    code: "GAS",
    name: "a".repeat(161),
    subtitle: null,
    iconKey: "factory",
    sortOrder: 0,
    isActive: true,
  });
  assertInvalid(parseFamilyInput, {
    id: null,
    sourceCode: null,
    name: "a".repeat(161),
    subtitle: null,
    iconKey: "boxes",
    sortOrder: 0,
    isActive: true,
  });
  assertInvalid(parseComponentInput, {
    id: null,
    familyId: FAMILY_ID,
    name: "a".repeat(201),
    description: null,
    iconKey: "component",
    sortOrder: 0,
    isActive: true,
  });
});

test("counts Unicode code points like PostgreSQL for entity name limits", () => {
  const categoryName = "😀".repeat(160);
  const familyName = "🧰".repeat(160);
  const componentName = "🔧".repeat(200);

  assert.equal(parseCategoryInput({
    id: null,
    code: "UNICODE",
    name: categoryName,
    subtitle: null,
    iconKey: "factory",
    sortOrder: 0,
    isActive: true,
  }).name, categoryName);
  assert.equal(parseFamilyInput({
    id: null,
    sourceCode: null,
    name: familyName,
    subtitle: null,
    iconKey: "boxes",
    sortOrder: 0,
    isActive: true,
  }).name, familyName);
  assert.equal(parseComponentInput({
    id: null,
    familyId: FAMILY_ID,
    name: componentName,
    description: null,
    iconKey: "component",
    sortOrder: 0,
    isActive: true,
  }).name, componentName);

  assertInvalid(parseCategoryInput, {
    id: null,
    code: "TOO-LONG",
    name: "😀".repeat(161),
    subtitle: null,
    iconKey: "factory",
    sortOrder: 0,
    isActive: true,
  });
  assertInvalid(parseComponentInput, {
    id: null,
    familyId: FAMILY_ID,
    name: "🔧".repeat(201),
    description: null,
    iconKey: "component",
    sortOrder: 0,
    isActive: true,
  });
});

test("requires nonempty variant text and at least one category", () => {
  const valid = {
    id: null,
    componentId: COMPONENT_ID,
    fabtekCode: "FT-001",
    oracleSapioCode: null,
    description: "Tubo",
    diameter: null,
    material: "PTFE",
    connection: "NPT",
    unitOfMeasureId: UNIT_ID,
    categoryIds: [CATEGORY_ID],
    trackInventory: true,
    sortOrder: 0,
    isActive: true,
  };

  for (const field of ["fabtekCode", "description", "material", "connection"]) {
    assertInvalid(parseVariantInput, { ...valid, [field]: " " });
  }
  assertInvalid(parseVariantInput, { ...valid, categoryIds: [] });
});

test("rejects duplicate or malformed variant category IDs", () => {
  const valid = {
    id: null,
    componentId: COMPONENT_ID,
    fabtekCode: "FT-001",
    oracleSapioCode: null,
    description: "Tubo",
    diameter: null,
    material: "PTFE",
    connection: "NPT",
    unitOfMeasureId: UNIT_ID,
    categoryIds: [CATEGORY_ID, SECOND_CATEGORY_ID],
    trackInventory: true,
    sortOrder: 0,
    isActive: true,
  };

  assertInvalid(parseVariantInput, {
    ...valid,
    categoryIds: [CATEGORY_ID, CATEGORY_ID],
  });
  assertInvalid(parseVariantInput, {
    ...valid,
    categoryIds: [
      "abcdefab-cdef-4abc-8def-abcdefabcdef",
      "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF",
    ],
  });
  assertInvalid(parseVariantInput, {
    ...valid,
    categoryIds: [CATEGORY_ID, "not-a-uuid"],
  });
  assertInvalid(parseVariantInput, {
    ...valid,
    categoryIds: new Array(1),
  });
});
