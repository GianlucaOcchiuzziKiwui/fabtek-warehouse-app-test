import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteCatalogEntity,
  getAdminCatalogFormOptions,
  getAdminCatalogPage,
  saveCategory,
  saveComponent,
  saveFamily,
  saveVariant,
  setCatalogEntityActive,
} from "../lib/data/admin-catalog.ts";

const CATEGORY_ID = "10000000-0000-0000-0000-000000000001";
const FAMILY_ID = "20000000-0000-0000-0000-000000000001";
const COMPONENT_ID = "30000000-0000-0000-0000-000000000001";
const VARIANT_ID = "40000000-0000-0000-0000-000000000001";
const UNIT_ID = "50000000-0000-0000-0000-000000000001";

function compact(value) {
  return value.replace(/\s+/gu, "");
}

function createSessionClient(responses = {}) {
  const calls = [];
  const responseQueues = new Map(
    Object.entries(responses).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : [value],
    ]),
  );

  class Query {
    constructor(table, response) {
      this.call = {
        table,
        operation: "read",
        select: null,
        selectOptions: null,
        payload: null,
        filters: [],
        orders: [],
        range: null,
      };
      this.response = response ?? { data: [], error: null, count: 0 };
      calls.push(this.call);
    }

    select(columns, options) {
      this.call.select = columns;
      this.call.selectOptions = options ?? null;
      return this;
    }

    eq(column, value) {
      this.call.filters.push(["eq", column, value]);
      return this;
    }

    or(filters) {
      this.call.filters.push(["or", filters]);
      return this;
    }

    order(column, options) {
      this.call.orders.push([column, options ?? null]);
      return this;
    }

    range(from, to) {
      this.call.range = [from, to];
      return this;
    }

    insert(payload) {
      this.call.operation = "insert";
      this.call.payload = payload;
      return this;
    }

    update(payload) {
      this.call.operation = "update";
      this.call.payload = payload;
      return this;
    }

    delete() {
      this.call.operation = "delete";
      return this;
    }

    maybeSingle() {
      return Promise.resolve(this.response);
    }

    then(resolve, reject) {
      return Promise.resolve(this.response).then(resolve, reject);
    }
  }

  function takeResponse(key) {
    const queue = responseQueues.get(key);
    return queue?.shift();
  }

  const client = {
    from(table) {
      return new Query(table, takeResponse(table));
    },
    rpc(name, args) {
      calls.push({ operation: "rpc", name, args });
      return Promise.resolve(
        takeResponse(`rpc:${name}`) ?? { data: null, error: null },
      );
    },
  };

  return { client, calls };
}

function dependencies(client) {
  return { createClient: async () => client };
}

function listQuery(overrides = {}) {
  return {
    tab: "categorie",
    status: "attivi",
    query: "",
    page: 1,
    ...overrides,
  };
}

test("category listing emits a bounded escaped search and maps its page", async () => {
  const { client, calls } = createSessionClient({
    categories: {
      data: [{
        id: CATEGORY_ID,
        code: "CAT-01",
        name: "Pompe",
        subtitle: "Processo",
        icon_key: "factory",
        sort_order: 3,
        is_active: false,
      }],
      error: null,
      count: 1,
    },
  });
  const search = `${"x".repeat(118)}%_ignored`;

  const result = await getAdminCatalogPage(listQuery({
    status: "inattivi",
    query: `  ${search}  `,
  }), dependencies(client));

  assert.deepEqual(result, {
    items: [{
      kind: "categoria",
      id: CATEGORY_ID,
      code: "CAT-01",
      name: "Pompe",
      subtitle: "Processo",
      iconKey: "factory",
      sortOrder: 3,
      isActive: false,
    }],
    page: 1,
    pageSize: 20,
    total: 1,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "categories");
  assert.equal(
    compact(calls[0].select),
    "id,code,name,subtitle,icon_key,sort_order,is_active",
  );
  assert.deepEqual(calls[0].selectOptions, { count: "exact" });
  assert.deepEqual(calls[0].filters[0], ["eq", "is_active", false]);
  assert.deepEqual(calls[0].filters[1], [
    "or",
    `code.ilike."%${"x".repeat(118)}\\%\\_%",name.ilike."%${"x".repeat(118)}\\%\\_%",subtitle.ilike."%${"x".repeat(118)}\\%\\_%"`,
  ]);
  assert.deepEqual(calls[0].orders, [
    ["sort_order", null],
    ["name", null],
  ]);
  assert.deepEqual(calls[0].range, [0, 19]);
});

test("each tab selects only its list fields and variants embed all display relations", async () => {
  const cases = [
    {
      tab: "famiglie",
      table: "families",
      select: "id,source_code,name,subtitle,icon_key,sort_order,is_active",
    },
    {
      tab: "componenti",
      table: "components",
      select: "id,family_id,name,description,icon_key,sort_order,is_active,family:families!inner(id,name,is_active)",
    },
    {
      tab: "varianti",
      table: "item_variants",
      select: "id,component_id,fabtek_code,oracle_sapio_code,description,diameter,material,connection,unit_of_measure_id,track_inventory,sort_order,is_active,component:components!inner(id,name,is_active,family:families!inner(id,name,is_active)),unit_of_measure:units_of_measure!inner(id,code,name,is_active),categories:item_variant_categories(category:categories!inner(id,name,is_active))",
    },
  ];

  for (const expected of cases) {
    const { client, calls } = createSessionClient({
      [expected.table]: { data: [], error: null, count: 0 },
    });

    await getAdminCatalogPage(
      listQuery({ tab: expected.tab, status: "tutti" }),
      dependencies(client),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, expected.table);
    assert.equal(compact(calls[0].select), expected.select);
    assert.equal(
      calls[0].filters.some((filter) => filter[1] === "is_active"),
      false,
    );
  }
});

test("variant listing maps embedded component, family, unit and categories without extra queries", async () => {
  const { client, calls } = createSessionClient({
    item_variants: {
      data: [{
        id: VARIANT_ID,
        component_id: COMPONENT_ID,
        fabtek_code: "FT-01",
        oracle_sapio_code: "SAP-01",
        description: "Tubo",
        diameter: "DN10",
        material: "PTFE",
        connection: "NPT",
        unit_of_measure_id: UNIT_ID,
        track_inventory: true,
        sort_order: 7,
        is_active: true,
        component: {
          id: COMPONENT_ID,
          name: "Tubi",
          is_active: true,
          family: { id: FAMILY_ID, name: "Flessibili", is_active: false },
        },
        unit_of_measure: {
          id: UNIT_ID,
          code: "m",
          name: "Metri",
          is_active: true,
        },
        categories: [{
          category: { id: CATEGORY_ID, name: "Gas", is_active: true },
        }],
      }],
      error: null,
      count: 1,
    },
  });

  const result = await getAdminCatalogPage(
    listQuery({ tab: "varianti" }),
    dependencies(client),
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(result.items[0], {
    kind: "variante",
    id: VARIANT_ID,
    componentId: COMPONENT_ID,
    fabtekCode: "FT-01",
    oracleSapioCode: "SAP-01",
    description: "Tubo",
    diameter: "DN10",
    material: "PTFE",
    connection: "NPT",
    unitOfMeasureId: UNIT_ID,
    trackInventory: true,
    sortOrder: 7,
    isActive: true,
    component: {
      id: COMPONENT_ID,
      name: "Tubi",
      isActive: true,
      familyId: FAMILY_ID,
      family: { id: FAMILY_ID, name: "Flessibili", isActive: false },
    },
    unitOfMeasure: {
      id: UNIT_ID,
      code: "m",
      name: "Metri",
      isActive: true,
    },
    categories: [{ id: CATEGORY_ID, name: "Gas", isActive: true }],
  });
  assert.deepEqual(calls[0].orders, [
    ["sort_order", null],
    ["fabtek_code", null],
  ]);
});

test("listing repeats the query on the last valid page when the requested page is too high", async () => {
  const { client, calls } = createSessionClient({
    categories: [
      { data: [], error: null, count: 21 },
      {
        data: [{
          id: CATEGORY_ID,
          code: "CAT-01",
          name: "Pompe",
          subtitle: null,
          icon_key: "factory",
          sort_order: 0,
          is_active: true,
        }],
        error: null,
        count: 21,
      },
    ],
  });

  const result = await getAdminCatalogPage(
    listQuery({ page: 99 }),
    dependencies(client),
  );

  assert.equal(result.page, 2);
  assert.equal(result.total, 21);
  assert.equal(result.items.length, 1);
  assert.deepEqual(calls.map((call) => call.range), [[1960, 1979], [20, 39]]);
});

test("form options load no tables for groups, only families for components, and all variant relations", async () => {
  const empty = { data: [], error: null };
  const noOptionsClient = createSessionClient();
  assert.deepEqual(
    await getAdminCatalogFormOptions("categorie", dependencies(noOptionsClient.client)),
    { categories: [], families: [], components: [], unitsOfMeasure: [] },
  );
  assert.equal(noOptionsClient.calls.length, 0);

  const componentClient = createSessionClient({ families: empty });
  await getAdminCatalogFormOptions(
    "componenti",
    dependencies(componentClient.client),
  );
  assert.deepEqual(componentClient.calls.map((call) => call.table), ["families"]);
  assert.equal(compact(componentClient.calls[0].select), "id,name,is_active");

  const variantClient = createSessionClient({
    categories: empty,
    components: empty,
    units_of_measure: empty,
  });
  await getAdminCatalogFormOptions(
    "varianti",
    dependencies(variantClient.client),
  );
  assert.deepEqual(
    variantClient.calls.map((call) => call.table).sort(),
    ["categories", "components", "units_of_measure"],
  );
  assert.equal(
    variantClient.calls.some((call) => call.table === "families"),
    false,
  );
});

test("form options map inactive parents as visible admin choices", async () => {
  const { client } = createSessionClient({
    categories: {
      data: [{ id: CATEGORY_ID, name: "Gas", is_active: false }],
      error: null,
    },
    components: {
      data: [{
        id: COMPONENT_ID,
        name: "Tubi",
        family_id: FAMILY_ID,
        is_active: true,
        family: { id: FAMILY_ID, name: "Flessibili", is_active: false },
      }],
      error: null,
    },
    units_of_measure: {
      data: [{ id: UNIT_ID, code: "m", name: "Metri", is_active: true }],
      error: null,
    },
  });

  const result = await getAdminCatalogFormOptions(
    "varianti",
    dependencies(client),
  );

  assert.deepEqual(result, {
    categories: [{ id: CATEGORY_ID, name: "Gas", isActive: false }],
    families: [],
    components: [{
      id: COMPONENT_ID,
      name: "Tubi",
      familyId: FAMILY_ID,
      isActive: true,
      family: { id: FAMILY_ID, name: "Flessibili", isActive: false },
    }],
    unitsOfMeasure: [{
      id: UNIT_ID,
      code: "m",
      name: "Metri",
      isActive: true,
    }],
  });
});

test("single-table saves emit normalized database payloads and return the row id", async () => {
  const categoryClient = createSessionClient({
    categories: { data: { id: CATEGORY_ID }, error: null },
  });
  const categoryResult = await saveCategory({
    id: null,
    code: "CAT-01",
    name: "Pompe",
    subtitle: null,
    iconKey: "factory",
    sortOrder: 2,
    isActive: true,
  }, dependencies(categoryClient.client));
  assert.deepEqual(categoryResult, { ok: true, data: { id: CATEGORY_ID } });
  assert.deepEqual(categoryClient.calls[0].payload, {
    code: "CAT-01",
    name: "Pompe",
    subtitle: null,
    icon_key: "factory",
    sort_order: 2,
    is_active: true,
  });

  const familyClient = createSessionClient({
    families: { data: { id: FAMILY_ID }, error: null },
  });
  await saveFamily({
    id: FAMILY_ID,
    sourceCode: null,
    name: "Flessibili",
    subtitle: "Linea",
    iconKey: "boxes",
    sortOrder: 1,
    isActive: false,
  }, dependencies(familyClient.client));
  assert.equal(familyClient.calls[0].operation, "update");
  assert.deepEqual(familyClient.calls[0].filters, [["eq", "id", FAMILY_ID]]);
  assert.deepEqual(familyClient.calls[0].payload, {
    source_code: null,
    name: "Flessibili",
    subtitle: "Linea",
    icon_key: "boxes",
    sort_order: 1,
    is_active: false,
  });

  const componentClient = createSessionClient({
    components: { data: { id: COMPONENT_ID }, error: null },
  });
  await saveComponent({
    id: null,
    familyId: FAMILY_ID,
    name: "Tubi",
    description: null,
    iconKey: "component",
    sortOrder: 4,
    isActive: true,
  }, dependencies(componentClient.client));
  assert.deepEqual(componentClient.calls[0].payload, {
    family_id: FAMILY_ID,
    name: "Tubi",
    description: null,
    icon_key: "component",
    sort_order: 4,
    is_active: true,
  });
});

test("variant saves use the atomic RPC and forward every normalized field", async () => {
  const { client, calls } = createSessionClient({
    "rpc:save_catalog_variant": { data: VARIANT_ID, error: null },
  });

  const result = await saveVariant({
    id: VARIANT_ID,
    componentId: COMPONENT_ID,
    fabtekCode: "FT-01",
    oracleSapioCode: null,
    description: "Tubo",
    diameter: null,
    material: "PTFE",
    connection: "NPT",
    unitOfMeasureId: UNIT_ID,
    categoryIds: [CATEGORY_ID],
    trackInventory: false,
    sortOrder: 8,
    isActive: true,
  }, dependencies(client));

  assert.deepEqual(result, { ok: true, data: { id: VARIANT_ID } });
  assert.deepEqual(calls, [{
    operation: "rpc",
    name: "save_catalog_variant",
    args: {
      p_id: VARIANT_ID,
      p_component_id: COMPONENT_ID,
      p_fabtek_code: "FT-01",
      p_oracle_sapio_code: null,
      p_description: "Tubo",
      p_diameter: null,
      p_material: "PTFE",
      p_connection: "NPT",
      p_unit_of_measure_id: UNIT_ID,
      p_category_ids: [CATEGORY_ID],
      p_track_inventory: false,
      p_sort_order: 8,
      p_is_active: true,
    },
  }]);
});

test("activation and deletion use a fixed tab-to-table mapping", async () => {
  const toggleClient = createSessionClient({
    item_variants: { data: { id: VARIANT_ID }, error: null },
  });
  const toggleResult = await setCatalogEntityActive(
    "varianti",
    VARIANT_ID,
    false,
    dependencies(toggleClient.client),
  );
  assert.deepEqual(toggleResult, { ok: true, data: { id: VARIANT_ID } });
  assert.equal(toggleClient.calls[0].table, "item_variants");
  assert.equal(toggleClient.calls[0].operation, "update");
  assert.equal(toggleClient.calls[0].payload.is_active, false);
  assert.equal(typeof toggleClient.calls[0].payload.updated_at, "string");
  assert.deepEqual(Object.keys(toggleClient.calls[0].payload).sort(), [
    "is_active",
    "updated_at",
  ]);

  const deleteClient = createSessionClient({
    components: { data: { id: COMPONENT_ID }, error: null },
  });
  const deleteResult = await deleteCatalogEntity(
    "componenti",
    COMPONENT_ID,
    dependencies(deleteClient.client),
  );
  assert.deepEqual(deleteResult, { ok: true, data: { id: COMPONENT_ID } });
  assert.equal(deleteClient.calls[0].table, "components");
  assert.equal(deleteClient.calls[0].operation, "delete");
});

test("mutation errors map duplicate, relation, referenced, missing and infrastructure failures safely", async () => {
  const duplicate = createSessionClient({
    categories: { data: null, error: { code: "23505", message: "secret row" } },
  });
  const duplicateResult = await saveCategory({
    id: null,
    code: "CAT-01",
    name: "Pompe",
    subtitle: null,
    iconKey: "factory",
    sortOrder: 0,
    isActive: true,
  }, dependencies(duplicate.client));
  assert.deepEqual(duplicateResult, {
    ok: false,
    error: {
      code: "CATALOG_ENTITY_DUPLICATE",
      message: "Esiste già una voce del catalogo con questi dati.",
    },
  });

  const relation = createSessionClient({
    components: { data: null, error: { code: "23503" } },
  });
  const relationResult = await saveComponent({
    id: null,
    familyId: FAMILY_ID,
    name: "Tubi",
    description: null,
    iconKey: "component",
    sortOrder: 0,
    isActive: true,
  }, dependencies(relation.client));
  assert.equal(relationResult.ok, false);
  assert.equal(relationResult.error.code, "CATALOG_RELATION_INVALID");

  const referenced = createSessionClient({
    categories: { data: null, error: { code: "23503" } },
  });
  const referencedResult = await deleteCatalogEntity(
    "categorie",
    CATEGORY_ID,
    dependencies(referenced.client),
  );
  assert.equal(referencedResult.ok, false);
  assert.equal(referencedResult.error.code, "CATALOG_ENTITY_REFERENCED");

  const missing = createSessionClient({
    families: { data: null, error: null },
  });
  const missingResult = await setCatalogEntityActive(
    "famiglie",
    FAMILY_ID,
    true,
    dependencies(missing.client),
  );
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.error.code, "CATALOG_ENTITY_NOT_FOUND");

  const unavailable = createSessionClient({
    families: { data: null, error: { code: "XX000", message: "password" } },
  });
  const unavailableResult = await deleteCatalogEntity(
    "famiglie",
    FAMILY_ID,
    dependencies(unavailable.client),
  );
  assert.deepEqual(unavailableResult, {
    ok: false,
    error: {
      code: "CATALOG_UNAVAILABLE",
      message: "Il catalogo non è disponibile in questo momento.",
    },
  });
});

test("list infrastructure failures throw a stable public error without database details", async () => {
  const { client } = createSessionClient({
    categories: {
      data: null,
      error: { code: "XX000", message: "password=secret" },
      count: null,
    },
  });

  await assert.rejects(
    getAdminCatalogPage(listQuery(), dependencies(client)),
    (error) => {
      assert.equal(error.name, "AdminCatalogDataError");
      assert.equal(error.message, "Il catalogo non è disponibile in questo momento.");
      assert.doesNotMatch(error.message, /password|secret/iu);
      return true;
    },
  );
});
