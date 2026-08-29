import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

const projectRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();

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

function Link({ href, children, ...props }) {
  return React.createElement("a", { href, ...props }, children);
}

const EMPTY_OPTIONS = {
  categories: [],
  families: [],
  components: [],
  unitsOfMeasure: [],
};

function emptyPage(overrides = {}) {
  return { items: [], page: 1, pageSize: 20, total: 0, ...overrides };
}

function pageOverrides({ events, result = emptyPage(), onManagement = () => {} }) {
  return new Map([
    ["@/lib/auth/current-profile", {
      async requirePermission(permission) {
        events.push(["permission", permission]);
      },
    }],
    ["@/lib/data/admin-catalog", {
      AdminCatalogDataError: class AdminCatalogDataError extends Error {},
      async getAdminCatalogPage(query) {
        events.push(["page", query]);
        return result;
      },
      async getAdminCatalogFormOptions(tab) {
        events.push(["options", tab]);
        return EMPTY_OPTIONS;
      },
    }],
    ["@/components/admin/catalog/catalog-management", {
      CatalogManagement(props) {
        onManagement(props);
        return React.createElement("div", null, "Catalog management");
      },
    }],
    ["@/components/shared/page-heading", {
      PageHeading({ title }) {
        return React.createElement("h1", null, title);
      },
    }],
  ]);
}

test("authorizes catalog management before loading the active tab and its form options", async () => {
  const events = [];
  let managementProps;
  const page = loadProjectModule(
    "app/(app)/admin/catalogo/page.tsx",
    pageOverrides({
      events,
      onManagement: (props) => { managementProps = props; },
    }),
  );

  const tree = await page.default({
    searchParams: Promise.resolve({
      tab: "componenti",
      q: " valvole ",
      status: "inattivi",
      page: "2",
    }),
  });
  renderToStaticMarkup(tree);

  assert.deepEqual(events, [
    ["permission", "catalog:manage"],
    ["page", { tab: "componenti", query: "valvole", status: "inattivi", page: 2 }],
    ["options", "componenti"],
  ]);
  assert.equal(managementProps.query.tab, "componenti");
  assert.deepEqual(managementProps.formOptions, EMPTY_OPTIONS);
});

test("does not access catalog data when the permission check fails", async () => {
  const events = [];
  const denied = new Error("forbidden");
  const overrides = pageOverrides({ events });
  overrides.set("@/lib/auth/current-profile", {
    async requirePermission(permission) {
      events.push(["permission", permission]);
      throw denied;
    },
  });
  const page = loadProjectModule("app/(app)/admin/catalogo/page.tsx", overrides);

  await assert.rejects(
    page.default({ searchParams: Promise.resolve({ tab: "varianti" }) }),
    denied,
  );
  assert.deepEqual(events, [["permission", "catalog:manage"]]);
});

test("loads each supported tab and falls back to categories for unknown values", async () => {
  for (const [rawTab, expectedTab] of [
    ["categorie", "categorie"],
    ["famiglie", "famiglie"],
    ["componenti", "componenti"],
    ["varianti", "varianti"],
    ["fornitori", "categorie"],
  ]) {
    const events = [];
    const page = loadProjectModule(
      "app/(app)/admin/catalogo/page.tsx",
      pageOverrides({ events }),
    );

    await page.default({ searchParams: Promise.resolve({ tab: rawTab }) });

    assert.equal(events[1][1].tab, expectedTab);
    assert.equal(events[2][1], expectedTab);
  }
});

test("catalog links retain the complete server-side filter state", () => {
  const { buildAdminCatalogHref } = loadProjectModule(
    "components/admin/catalog/catalog-management.tsx",
    new Map([["next/link", Link]]),
  );
  const query = {
    tab: "categorie",
    query: "valvole & tubi",
    status: "inattivi",
    page: 2,
  };

  assert.equal(
    buildAdminCatalogHref(query, { tab: "famiglie", page: 3 }),
    "/admin/catalogo?tab=famiglie&q=valvole+%26+tubi&status=inattivi&page=3",
  );
});

test("renders accessible filters, responsive rows, statuses and pagination", () => {
  const { CatalogManagement } = loadProjectModule(
    "components/admin/catalog/catalog-management.tsx",
    new Map([["next/link", Link]]),
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogManagement, {
    query: { tab: "categorie", query: "pompe", status: "tutti", page: 2 },
    result: emptyPage({
      page: 2,
      total: 41,
      items: [{
        kind: "categoria",
        id: "10000000-0000-0000-0000-000000000001",
        code: "CAT-01",
        name: "Pompe",
        subtitle: "Processo",
        iconKey: "factory",
        sortOrder: 4,
        isActive: false,
      }],
    }),
    formOptions: EMPTY_OPTIONS,
  }));

  assert.match(markup, /aria-label="Sezioni gestione catalogo"/u);
  assert.match(markup, /aria-current="page"/u);
  assert.match(markup, />Nuovo</u);
  assert.match(markup, /disabled=""/u);
  assert.match(markup, /<label[^>]*for="admin-catalog-query"/u);
  assert.match(markup, /<label[^>]*for="admin-catalog-status"/u);
  assert.match(markup, /name="tab" value="categorie"/u);
  assert.match(markup, /class="[^"]*hidden[^"]*md:block/u);
  assert.match(markup, /class="[^"]*md:hidden/u);
  assert.match(markup, />Inattivo</u);
  assert.match(markup, /Pagina 2 di 3/u);
  assert.match(markup, /tab=categorie&amp;q=pompe&amp;status=tutti&amp;page=1/u);
  assert.match(markup, /tab=categorie&amp;q=pompe&amp;status=tutti&amp;page=3/u);
});

test("renders explicit empty and recoverable data-error states", () => {
  const { CatalogManagement } = loadProjectModule(
    "components/admin/catalog/catalog-management.tsx",
    new Map([["next/link", Link]]),
  );
  const props = {
    query: { tab: "varianti", query: "", status: "attivi", page: 1 },
    result: emptyPage(),
    formOptions: EMPTY_OPTIONS,
  };

  const emptyMarkup = renderToStaticMarkup(
    React.createElement(CatalogManagement, props),
  );
  const errorMarkup = renderToStaticMarkup(
    React.createElement(CatalogManagement, { ...props, result: null, loadError: true }),
  );

  assert.match(emptyMarkup, /Nessuna variante trovata/u);
  assert.match(errorMarkup, /Catalogo non disponibile/u);
  assert.match(errorMarkup, /Riprova/u);
});

test("shows the catalog management destination only to Admin users", () => {
  const { AppNavigation } = loadProjectModule(
    "components/layout/app-navigation.tsx",
    new Map([
      ["next/link", Link],
      ["../requests/request-cart-header", { RequestCartHeader() { return null; } }],
    ]),
  );

  const userMarkup = renderToStaticMarkup(
    React.createElement(AppNavigation, { isAdmin: false }),
  );
  const adminMarkup = renderToStaticMarkup(
    React.createElement(AppNavigation, { isAdmin: true }),
  );

  assert.doesNotMatch(userMarkup, /Gestisci catalogo/u);
  assert.match(adminMarkup, /href="\/admin\/catalogo"/u);
  assert.match(adminMarkup, /Gestisci catalogo/u);
});

test("the route loading state announces progress", async () => {
  const source = await readFile("app/(app)/admin/catalogo/loading.tsx", "utf8");
  assert.match(source, /aria-label="Caricamento gestione catalogo"/u);
});
