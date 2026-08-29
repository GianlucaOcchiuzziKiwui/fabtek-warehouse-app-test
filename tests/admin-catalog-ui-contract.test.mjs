import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

import { CATALOG_ICON_KEYS } from "../lib/data/catalog-mappers.ts";

const projectRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();

function loadProjectModule(relativePath, cache = new Map()) {
  const filename = path.resolve(projectRoot, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;

  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const source = projectRequire("node:fs").readFileSync(filename, "utf8");
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
    if (specifier.startsWith("@/")) {
      const resolved = path.resolve(projectRoot, specifier.slice(2));
      for (const extension of ["", ".ts", ".tsx"]) {
        const candidate = `${resolved}${extension}`;
        try {
          return loadProjectModule(path.relative(projectRoot, candidate), cache);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
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

test("the shared icon registry covers every allowed persisted icon", async () => {
  const source = await readFile("components/catalog/catalog-icon.tsx", "utf8");
  const registryBody = source.match(/const CATALOG_ICONS[^=]*=\s*\{([\s\S]*?)\n\};/u)?.[1] ?? "";
  const registryKeys = [...registryBody.matchAll(/^\s*(?:"([^"]+)"|([a-z-]+))\s*:/gmu)]
    .map((match) => match[1] ?? match[2]);

  assert.deepEqual(registryKeys.sort(), [...CATALOG_ICON_KEYS].sort());
});

test("public catalog navigation consumes the shared icon component", async () => {
  const source = await readFile("components/catalog/catalog-navigation.tsx", "utf8");

  assert.match(source, /import \{ CatalogIcon \} from "@\/components\/catalog\/catalog-icon";/u);
  assert.match(source, /<CatalogIcon\s+iconKey=\{iconKey\}/u);
  assert.doesNotMatch(source, /const TILE_ICONS/u);
});

test("icon select renders the current icon and its readable Italian label", () => {
  const { CatalogIconSelect } = loadProjectModule(
    "components/admin/catalog/catalog-icon-select.tsx",
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogIconSelect, {
    name: "iconKey",
    value: "circle-gauge",
    onValueChange() {},
  }));

  assert.match(markup, /name="iconKey"/u);
  assert.match(markup, /data-catalog-icon="circle-gauge"/u);
  assert.match(markup, />Indicatore circolare</u);
});

test("dialog adapters preserve title, description and close semantics", async () => {
  const [dialog, alertDialog] = await Promise.all([
    readFile("components/ui/dialog.tsx", "utf8"),
    readFile("components/ui/alert-dialog.tsx", "utf8"),
  ]);

  assert.match(dialog, /DialogPrimitive\.Title/u);
  assert.match(dialog, /DialogPrimitive\.Description/u);
  assert.match(dialog, /DialogPrimitive\.Close/u);
  assert.match(dialog, /aria-label="Chiudi"/u);
  assert.match(alertDialog, /AlertDialogPrimitive\.Title/u);
  assert.match(alertDialog, /AlertDialogPrimitive\.Description/u);
  assert.match(alertDialog, /AlertDialogPrimitive\.Cancel/u);
});
