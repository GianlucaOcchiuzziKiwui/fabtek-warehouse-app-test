import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";

const projectRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();
const ID = "10000000-0000-4000-8000-000000000001";
const COMPONENT_ID = "20000000-0000-4000-8000-000000000002";
const UNIT_ID = "30000000-0000-4000-8000-000000000003";
const CATEGORY_ID = "40000000-0000-4000-8000-000000000004";

function loadProjectModule(relativePath, overrides = new Map(), cache = new Map()) {
  const filename = path.resolve(projectRoot, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;

  const source = projectRequire("node:fs").readFileSync(filename, "utf8");
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const { code } = transformSync(source, {
    filename,
    jsc: {
      parser: { syntax: "typescript", tsx: filename.endsWith(".tsx") },
      target: "es2022",
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
  });

  function loadLocal(candidate) {
    for (const extension of ["", ".ts", ".tsx"]) {
      const resolved = `${candidate}${extension}`;
      try {
        return loadProjectModule(path.relative(projectRoot, resolved), overrides, cache);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    throw Object.assign(new Error(`Cannot resolve ${candidate}`), { code: "ENOENT" });
  }

  function localRequire(specifier) {
    if (overrides.has(specifier)) return overrides.get(specifier);
    if (specifier.startsWith("@/")) {
      return loadLocal(path.resolve(projectRoot, specifier.slice(2)));
    }
    if (specifier.startsWith(".")) {
      return loadLocal(path.resolve(path.dirname(filename), specifier));
    }
    return projectRequire(specifier);
  }

  new Function("require", "module", "exports", code)(
    localRequire,
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}

function validCategory(overrides = {}) {
  return {
    id: null,
    code: " CAT-01 ",
    name: " Pompe ",
    subtitle: " Processo ",
    iconKey: "factory",
    sortOrder: "4",
    isActive: true,
    ...overrides,
  };
}

function validVariant(overrides = {}) {
  return {
    id: null,
    componentId: COMPONENT_ID,
    fabtekCode: " FT-001 ",
    oracleSapioCode: " ORA-01 ",
    datasheetUrl: " ",
    description: " Tubo PTFE ",
    diameter: " 12 mm ",
    material: " PTFE ",
    connection: " 1/2 NPT ",
    unitOfMeasureId: UNIT_ID,
    categoryIds: [CATEGORY_ID],
    trackInventory: false,
    sortOrder: "4",
    isActive: true,
    ...overrides,
  };
}

function actionOverrides({ events, saveResult = { ok: true, data: { id: ID } } }) {
  return new Map([
    ["@/lib/auth/current-profile", {
      async requirePermission(permission) {
        events.push(["permission", permission]);
      },
    }],
    ["@/lib/data/admin-catalog", {
      async saveCategory(input) {
        events.push(["save-category", input]);
        return saveResult;
      },
      async saveFamily(input) {
        events.push(["save-family", input]);
        return saveResult;
      },
      async saveComponent(input) {
        events.push(["save-component", input]);
        return saveResult;
      },
      async saveUnit(input) {
        events.push(["save-unit", input]);
        return saveResult;
      },
      async saveVariant(input) {
        events.push(["save-variant", input]);
        return saveResult;
      },
      async setCatalogEntityActive(tab, id, isActive) {
        events.push(["set-active", tab, id, isActive]);
        return saveResult;
      },
      async deleteCatalogEntity(tab, id) {
        events.push(["delete", tab, id]);
        return saveResult;
      },
    }],
    ["next/cache", {
      revalidatePath(value) {
        events.push(["revalidate", value]);
      },
    }],
  ]);
}

test("save authorizes before parsing and repository access", async () => {
  const events = [];
  const actions = loadProjectModule(
    "app/(app)/admin/catalogo/actions.ts",
    actionOverrides({ events }),
  );

  const result = await actions.saveCategoryAction(validCategory());

  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    ["permission", "catalog:manage"],
    ["save-category", {
      id: null,
      code: "CAT-01",
      name: "Pompe",
      subtitle: "Processo",
      iconKey: "factory",
      sortOrder: 4,
      isActive: true,
    }],
    ["revalidate", "/admin/catalogo"],
    ["revalidate", "/catalogo"],
  ]);
});

test("permission failure prevents validation and repository access", async () => {
  const events = [];
  const denied = new Error("forbidden");
  const overrides = actionOverrides({ events });
  overrides.set("@/lib/auth/current-profile", {
    async requirePermission(permission) {
      events.push(["permission", permission]);
      throw denied;
    },
  });
  const actions = loadProjectModule("app/(app)/admin/catalogo/actions.ts", overrides);

  await assert.rejects(actions.saveCategoryAction(null), denied);
  assert.deepEqual(events, [["permission", "catalog:manage"]]);
});

test("invalid save input returns the stable validation error without repository access", async () => {
  const events = [];
  const actions = loadProjectModule(
    "app/(app)/admin/catalogo/actions.ts",
    actionOverrides({ events }),
  );

  const result = await actions.saveCategoryAction(validCategory({ code: "" }));

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "CATALOG_INPUT_INVALID",
      message: "Controlla i dati del catalogo inseriti.",
    },
  });
  assert.deepEqual(events, [["permission", "catalog:manage"]]);
});

test("repository errors remain stable and do not revalidate", async () => {
  const events = [];
  const duplicate = {
    ok: false,
    error: {
      code: "CATALOG_ENTITY_DUPLICATE",
      message: "Esiste già una voce del catalogo con questi dati.",
    },
  };
  const actions = loadProjectModule(
    "app/(app)/admin/catalogo/actions.ts",
    actionOverrides({ events, saveResult: duplicate }),
  );

  const result = await actions.saveCategoryAction(validCategory());

  assert.deepEqual(result, duplicate);
  assert.equal(events.some(([event]) => event === "revalidate"), false);
});

test("family and component saves use their domain parser and repository", async () => {
  const events = [];
  const actions = loadProjectModule(
    "app/(app)/admin/catalogo/actions.ts",
    actionOverrides({ events }),
  );

  await actions.saveFamilyAction({
    id: null,
    sourceCode: " F-01 ",
    name: " Valvole ",
    subtitle: " Linea ",
    iconKey: "wrench",
    sortOrder: "2",
    isActive: true,
  });
  await actions.saveComponentAction({
    id: null,
    familyId: ID,
    name: " Corpo ",
    description: " Acciaio ",
    iconKey: "component",
    sortOrder: "3",
    isActive: false,
  });

  assert.deepEqual(events.find(([event]) => event === "save-family")?.[1], {
    id: null,
    sourceCode: "F-01",
    name: "Valvole",
    subtitle: "Linea",
    iconKey: "wrench",
    sortOrder: 2,
    isActive: true,
  });
  assert.deepEqual(events.find(([event]) => event === "save-component")?.[1], {
    id: null,
    familyId: ID,
    name: "Corpo",
    description: "Acciaio",
    iconKey: "component",
    sortOrder: 3,
    isActive: false,
  });
});

test("quick unit save authorizes, validates and revalidates catalog reads", async () => {
  const events = [];
  const actions = loadProjectModule(
    "app/(app)/admin/catalogo/actions.ts",
    actionOverrides({ events }),
  );

  assert.equal(typeof actions.saveUnitAction, "function");
  const result = await actions.saveUnitAction({
    code: " kg ",
    name: " Chilogrammi ",
    allowsFraction: true,
  });

  assert.deepEqual(result, { ok: true, data: { id: ID } });
  assert.deepEqual(events, [
    ["permission", "catalog:manage"],
    ["save-unit", {
      code: "kg",
      name: "Chilogrammi",
      allowsFraction: true,
    }],
    ["revalidate", "/admin/catalogo"],
    ["revalidate", "/catalogo"],
  ]);
});

test("variant save authorizes and forwards the complete normalized payload atomically", async () => {
  const events = [];
  const actions = loadProjectModule(
    "app/(app)/admin/catalogo/actions.ts",
    actionOverrides({ events }),
  );

  const result = await actions.saveVariantAction(validVariant());

  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    ["permission", "catalog:manage"],
    ["save-variant", {
      id: null,
      componentId: COMPONENT_ID,
      fabtekCode: "FT-001",
          oracleSapioCode: "ORA-01",
          datasheetUrl: null,
      description: "Tubo PTFE",
      diameter: "12 mm",
      material: "PTFE",
      connection: "1/2 NPT",
      unitOfMeasureId: UNIT_ID,
      categoryIds: [CATEGORY_ID],
      trackInventory: false,
      sortOrder: 4,
      isActive: true,
    }],
    ["revalidate", "/admin/catalogo"],
    ["revalidate", "/catalogo"],
  ]);
});

test("variant save rejects empty or duplicate categories before repository access", async () => {
  for (const categoryIds of [[], [CATEGORY_ID, CATEGORY_ID]]) {
    const events = [];
    const actions = loadProjectModule(
      "app/(app)/admin/catalogo/actions.ts",
      actionOverrides({ events }),
    );

    const result = await actions.saveVariantAction(validVariant({ categoryIds }));

    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "CATALOG_INPUT_INVALID",
        message: "Controlla i dati del catalogo inseriti.",
      },
    });
    assert.deepEqual(events, [["permission", "catalog:manage"]]);
  }
});

test("variant repository relation and duplicate errors stay stable without revalidation", async () => {
  for (const saveResult of [
    {
      ok: false,
      error: {
        code: "CATALOG_ENTITY_DUPLICATE",
        message: "Esiste già una voce del catalogo con questi dati.",
      },
    },
    {
      ok: false,
      error: {
        code: "CATALOG_RELATION_INVALID",
        message: "La relazione selezionata non è disponibile.",
      },
    },
  ]) {
    const events = [];
    const actions = loadProjectModule(
      "app/(app)/admin/catalogo/actions.ts",
      actionOverrides({ events, saveResult }),
    );

    const result = await actions.saveVariantAction(validVariant());

    assert.deepEqual(result, saveResult);
    assert.equal(events.some(([event]) => event === "revalidate"), false);
  }
});

test("toggle and delete accept only the catalog entity discriminant, never a raw table", async () => {
  const events = [];
  const actions = loadProjectModule(
    "app/(app)/admin/catalogo/actions.ts",
    actionOverrides({ events }),
  );

  const toggled = await actions.setCatalogEntityActiveAction({
    entity: "componenti",
    id: ID,
    isActive: false,
  });
  const deleted = await actions.deleteCatalogEntityAction({
    entity: "famiglie",
    id: ID,
  });
  const rejected = await actions.deleteCatalogEntityAction({
    entity: "categories",
    table: "categories",
    id: ID,
  });

  assert.equal(toggled.ok, true);
  assert.equal(deleted.ok, true);
  assert.deepEqual(rejected, {
    ok: false,
    error: {
      code: "CATALOG_INPUT_INVALID",
      message: "Controlla i dati del catalogo inseriti.",
    },
  });
  assert.deepEqual(events.filter(([event]) => event === "set-active"), [
    ["set-active", "componenti", ID, false],
  ]);
  assert.deepEqual(events.filter(([event]) => event === "delete"), [
    ["delete", "famiglie", ID],
  ]);
});
