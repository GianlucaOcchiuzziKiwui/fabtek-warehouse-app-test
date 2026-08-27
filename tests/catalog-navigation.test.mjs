import assert from "node:assert/strict";
import test from "node:test";

import * as catalogMappers from "../lib/data/catalog-mappers.ts";

test("exposes one catalog navigation state resolver for both catalog flows", () => {
  assert.equal(typeof catalogMappers.resolveCatalogNavigationStep, "function");
});

test("advances only through category, family, component and then items", () => {
  const resolve = catalogMappers.resolveCatalogNavigationStep;

  assert.equal(resolve({}), "categories");
  assert.equal(resolve({ categoryId: "category" }), "families");
  assert.equal(
    resolve({ categoryId: "category", familyId: "family" }),
    "components",
  );
  assert.equal(
    resolve({
      categoryId: "category",
      familyId: "family",
      componentId: "component",
    }),
    "items",
  );
});

test("taxonomy search takes priority over a stale navigation path", () => {
  assert.equal(
    catalogMappers.resolveCatalogNavigationStep({
      query: "valvole",
      categoryId: "category",
      familyId: "family",
      componentId: "component",
    }),
    "search",
  );
});

test("canonical search clears the hierarchical path and pagination", () => {
  const filters = catalogMappers.canonicalizeCatalogFilters({
    query: "valvole",
    categoryId: "category",
    familyId: "family",
    componentId: "component",
    page: 4,
  }, {
    categories: [{ id: "category", name: "Gas" }],
    families: [{ id: "family", name: "Valvole" }],
    components: [{ id: "component", name: "Valvola manuale" }],
  });

  assert.deepEqual(filters, {
    query: "valvole",
    categoryId: undefined,
    familyId: undefined,
    componentId: undefined,
    page: 1,
  });
});

test("a family cannot bypass the category step", () => {
  const filters = catalogMappers.canonicalizeCatalogFilters({
    familyId: "family",
  }, {
    categories: [],
    families: [{ id: "family", name: "Valvole" }],
    components: [],
  });

  assert.equal(filters.familyId, undefined);
  assert.equal(filters.componentId, undefined);
});

test("exposes validated taxonomy matches and shared path URLs", () => {
  assert.equal(typeof catalogMappers.mapCatalogNavigationMatches, "function");
  assert.equal(typeof catalogMappers.buildCatalogNavigationHref, "function");
});

test("uses correct Italian taxonomy labels in singular and plural", () => {
  assert.equal(catalogMappers.getCatalogNavigationKindLabel("category", 1), "Categoria");
  assert.equal(catalogMappers.getCatalogNavigationKindLabel("category", 2), "Categorie");
  assert.equal(catalogMappers.getCatalogNavigationKindLabel("family", 2), "Famiglie");
  assert.equal(catalogMappers.getCatalogNavigationKindLabel("component", 2), "Componenti");
});

test("accepts only supported catalog icon keys and falls back safely", () => {
  assert.equal(catalogMappers.normalizeCatalogIconKey("gauge", "factory"), "gauge");
  assert.equal(catalogMappers.normalizeCatalogIconKey("<svg onload=alert(1)>", "boxes"), "boxes");
  assert.equal(catalogMappers.normalizeCatalogIconKey(null, "component"), "component");
});

test("maps database catalog options with their persisted icon key", () => {
  assert.deepEqual(catalogMappers.mapCatalogOptions([
    { family: { id: "family-1", name: "Valvole", icon_key: "wrench" } },
    { family: { id: "family-2", name: "Altro", icon_key: "unknown-icon" } },
  ], "boxes", "family"), [
    { id: "family-1", name: "Valvole", iconKey: "wrench" },
    { id: "family-2", name: "Altro", iconKey: "boxes" },
  ]);
});

test("derives unique ordered families and components from active item rows", () => {
  const rows = [
    {
      item_variant: {
        is_active: true,
        component: {
          id: "component-b",
          name: "Tubi",
          icon_key: "cable",
          sort_order: 20,
          is_active: true,
          family: {
            id: "family-b",
            name: "Tubazioni",
            icon_key: "boxes",
            sort_order: 20,
            is_active: true,
          },
        },
      },
    },
    {
      item_variant: {
        is_active: true,
        component: {
          id: "component-a",
          name: "Valvole manuali",
          icon_key: "wrench",
          sort_order: 10,
          is_active: true,
          family: {
            id: "family-a",
            name: "Valvole",
            icon_key: "wrench",
            sort_order: 10,
            is_active: true,
          },
        },
      },
    },
    {
      item_variant: {
        is_active: true,
        component: {
          id: "component-a",
          name: "Valvole manuali",
          icon_key: "wrench",
          sort_order: 10,
          is_active: true,
          family: {
            id: "family-a",
            name: "Valvole",
            icon_key: "wrench",
            sort_order: 10,
            is_active: true,
          },
        },
      },
    },
  ];

  assert.deepEqual(catalogMappers.mapDerivedCatalogOptions(rows, "family"), [
    { id: "family-a", name: "Valvole", iconKey: "wrench" },
    { id: "family-b", name: "Tubazioni", iconKey: "boxes" },
  ]);
  assert.deepEqual(catalogMappers.mapDerivedCatalogOptions(rows, "component"), [
    { id: "component-a", name: "Valvole manuali", iconKey: "wrench" },
    { id: "component-b", name: "Tubi", iconKey: "cable" },
  ]);
});

test("does not derive taxonomy options from inactive or malformed item paths", () => {
  const activePath = {
    item_variant: {
      is_active: true,
      component: {
        id: "component-active",
        name: "Componente attivo",
        sort_order: 0,
        is_active: true,
        family: {
          id: "family-active",
          name: "Famiglia attiva",
          sort_order: 0,
          is_active: true,
        },
      },
    },
  };
  const inactiveItem = structuredClone(activePath);
  inactiveItem.item_variant.is_active = false;
  const inactiveComponent = structuredClone(activePath);
  inactiveComponent.item_variant.component.is_active = false;
  const inactiveFamily = structuredClone(activePath);
  inactiveFamily.item_variant.component.family.is_active = false;

  assert.deepEqual(catalogMappers.mapDerivedCatalogOptions([
    null,
    {},
    inactiveItem,
    inactiveComponent,
    inactiveFamily,
    activePath,
  ], "family"), [
    { id: "family-active", name: "Famiglia attiva", iconKey: "boxes" },
  ]);
});

test("keeps separate category paths while removing duplicate item paths", () => {
  const component = {
    id: "cmp-manual",
    name: "Valvole manuali",
    icon_key: "component",
  };
  const family = {
    id: "fam-valves",
    name: "Valvole",
    icon_key: "wrench",
  };
  const gasPath = {
    kind: "component",
    category: { id: "cat-gas", name: "Gas" },
    family,
    component,
  };

  assert.deepEqual(catalogMappers.mapCatalogNavigationMatches([
    gasPath,
    gasPath,
    {
      ...gasPath,
      category: { id: "cat-water", name: "Acqua" },
    },
  ]).map((match) => match.category.id), ["cat-gas", "cat-water"]);
});

test("maps grouped taxonomy results with an unambiguous category path", () => {
  const matches = catalogMappers.mapCatalogNavigationMatches([
    {
      kind: "category",
      category: { id: "cat-gas", name: "Gas", icon_key: "cylinder" },
    },
    {
      kind: "family",
      category: { id: "cat-gas", name: "Gas", icon_key: "cylinder" },
      family: { id: "fam-valves", name: "Valvole", icon_key: "wrench" },
    },
    {
      kind: "component",
      category: { id: "cat-gas", name: "Gas", icon_key: "cylinder" },
      family: { id: "fam-valves", name: "Valvole", icon_key: "wrench" },
      component: { id: "cmp-manual", name: "Valvole manuali", icon_key: "component" },
    },
    {
      kind: "component",
      category: { id: "cat-gas", name: "Gas", icon_key: "cylinder" },
      family: { id: "fam-valves", name: "Valvole", icon_key: "wrench" },
      component: { id: "cmp-manual", name: "Valvole manuali", icon_key: "component" },
    },
    { kind: "component", category: { id: "cat-gas", name: "Gas" } },
  ]);

  assert.deepEqual(matches, [
    {
      kind: "category",
      category: { id: "cat-gas", name: "Gas", iconKey: "cylinder" },
      family: null,
      component: null,
    },
    {
      kind: "family",
      category: { id: "cat-gas", name: "Gas", iconKey: "cylinder" },
      family: { id: "fam-valves", name: "Valvole", iconKey: "wrench" },
      component: null,
    },
    {
      kind: "component",
      category: { id: "cat-gas", name: "Gas", iconKey: "cylinder" },
      family: { id: "fam-valves", name: "Valvole", iconKey: "wrench" },
      component: { id: "cmp-manual", name: "Valvole manuali", iconKey: "component" },
    },
  ]);
});

test("builds the same hierarchical links for catalog and request flows", () => {
  const componentMatch = {
    kind: "component",
    category: { id: "cat-gas", name: "Gas" },
    family: { id: "fam-valves", name: "Valvole" },
    component: { id: "cmp-manual", name: "Valvole manuali" },
  };

  assert.equal(
    catalogMappers.buildCatalogNavigationHref("/catalogo", componentMatch),
    "/catalogo?category=cat-gas&family=fam-valves&component=cmp-manual",
  );
  assert.equal(
    catalogMappers.buildCatalogNavigationHref("/richieste/nuova", {
      ...componentMatch,
      kind: "family",
      component: null,
    }),
    "/richieste/nuova?category=cat-gas&family=fam-valves",
  );
});
