import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import React, { Suspense } from "react";
import { transformSync } from "next/dist/build/swc/index.js";

const projectRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();

function loadProjectModule(relativePath, overrides, cache = new Map()) {
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

  function localRequire(specifier) {
    if (overrides.has(specifier)) return overrides.get(specifier);
    return projectRequire(specifier);
  }

  new Function("require", "module", "exports", code)(
    localRequire,
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}

test("materials page leaves searchParams unread in the app shell", () => {
  const NullComponent = () => null;
  const overrides = new Map([
    ["@/components/requests/request-catalog-picker", { RequestCatalogPicker: NullComponent }],
    ["@/components/requests/request-header-form", { RequestMaterialsGate: NullComponent }],
    ["@/components/shared/empty-state", { EmptyState: NullComponent }],
    ["@/components/shared/page-heading", { PageHeading: NullComponent }],
    ["@/components/ui/button", { Button: NullComponent }],
    ["@/lib/data/catalog", {
      CatalogDataError: class CatalogDataError extends Error {},
      getCatalogFilters() {},
      getCatalogVariantSelection() {},
      searchCatalog() {},
      searchCatalogNavigation() {},
    }],
    ["@/lib/data/catalog-mappers", {
      canonicalizeCatalogFilters() {},
      resolveCatalogNavigationStep() {},
    }],
    ["@/lib/domain/requests/navigation", { buildRequestHeaderHref() {} }],
    ["lucide-react", { PencilLine: NullComponent }],
    ["next/link", NullComponent],
  ]);
  const page = loadProjectModule(
    "app/(app)/richieste/nuova/materiali/page.tsx",
    overrides,
  );
  const searchParams = new Promise(() => {});

  const shell = page.default({ searchParams });

  assert.equal(React.isValidElement(shell), true);
  assert.equal(shell.type, Suspense);
  assert.equal(shell.props.children.props.searchParams, searchParams);
});
