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
const { AlertDialog: RadixAlertDialog, Dialog: RadixDialog } = projectRequire("radix-ui");

function loadProjectModule(relativePath, cache = new Map()) {
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

function colorContrast(left, right) {
  function luminance(hex) {
    const channels = hex.match(/[0-9a-f]{2}/giu).map((channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  const lighter = Math.max(luminance(left), luminance(right));
  const darker = Math.min(luminance(left), luminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

function themeToken(css, selector, token) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "u"))?.[1] ?? "";
  const rootBlock = selector === ":root"
    ? block
    : css.match(/:root\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";

  function declarations(source) {
    return new Map(
      [...source.matchAll(/--([a-z0-9-]+):\s*([^;]+);/giu)]
        .map((match) => [match[1], match[2].trim()]),
    );
  }

  const current = declarations(block);
  const root = declarations(rootBlock);
  function resolve(name, seen = new Set()) {
    if (seen.has(name)) return "";
    seen.add(name);
    const value = current.get(name) ?? root.get(name) ?? "";
    if (/^#[0-9a-f]{6}$/iu.test(value)) return value;
    const reference = value.match(/^var\(--([a-z0-9-]+)\)$/iu)?.[1];
    return reference ? resolve(reference, seen) : "";
  }

  return resolve(token);
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

test("icon select forwards controlled changes and ARIA relationships", () => {
  const { CatalogIconSelect } = loadProjectModule(
    "components/admin/catalog/catalog-icon-select.tsx",
  );
  const changes = [];
  const tree = CatalogIconSelect({
    value: "circle-gauge",
    onValueChange: (value) => changes.push(value),
    name: "iconKey",
    id: "catalog-icon",
    required: true,
    "aria-label": "Icona catalogo",
    "aria-describedby": "catalog-icon-help",
    "aria-invalid": true,
  });
  const [trigger] = React.Children.toArray(tree.props.children);

  assert.equal(tree.props.value, "circle-gauge");
  assert.equal(tree.props.name, "iconKey");
  assert.equal(tree.props.required, true);
  tree.props.onValueChange("wrench");
  assert.deepEqual(changes, ["wrench"]);
  assert.equal(trigger.props.id, "catalog-icon");
  assert.equal(trigger.props["aria-label"], "Icona catalogo");
  assert.equal(trigger.props["aria-describedby"], "catalog-icon-help");
  assert.equal(trigger.props["aria-invalid"], true);
});

test("select items expose a theme-independent keyboard focus ring", () => {
  const { SelectItem } = loadProjectModule("components/ui/select.tsx");
  const item = SelectItem({ value: "wrench", children: "Chiave inglese" });

  assert.match(item.props.className, /\bfocus-visible:ring-2\b/u);
  assert.match(item.props.className, /\bfocus-visible:ring-ring\b/u);
  assert.match(item.props.className, /\bfocus-visible:ring-inset\b/u);
});

test("destructive badge uses an AA text and background token pair in both themes", async () => {
  const { Badge } = loadProjectModule("components/ui/badge.tsx");
  const badge = Badge({ variant: "destructive", children: "Inattivo" });
  const css = await readFile("app/globals.css", "utf8");

  assert.match(badge.props.className, /\bbg-background\b/u);
  assert.match(badge.props.className, /\btext-foreground\b/u);
  assert.match(badge.props.className, /\bborder-destructive(?:\/\d+)?\b/u);

  for (const selector of [":root", ".dark"]) {
    const foreground = themeToken(css, selector, "foreground");
    const background = themeToken(css, selector, "background");
    assert.match(foreground, /^#[0-9a-f]{6}$/iu);
    assert.match(background, /^#[0-9a-f]{6}$/iu);
    assert.ok(
      colorContrast(foreground, background) >= 4.5,
      `${selector} destructive badge text must meet WCAG AA`,
    );
  }
});

test("dialog adapters retain Radix controlled-root and accessible content primitives", () => {
  const dialog = loadProjectModule("components/ui/dialog.tsx");
  const alertDialog = loadProjectModule("components/ui/alert-dialog.tsx");

  assert.equal(dialog.Dialog, RadixDialog.Root);
  assert.equal(dialog.DialogClose, RadixDialog.Close);
  assert.equal(dialog.DialogTitle({ children: "Titolo" }).type, RadixDialog.Title);
  assert.equal(
    dialog.DialogDescription({ children: "Descrizione" }).type,
    RadixDialog.Description,
  );
  assert.equal(alertDialog.AlertDialog, RadixAlertDialog.Root);
  assert.equal(
    alertDialog.AlertDialogTitle({ children: "Conferma" }).type,
    RadixAlertDialog.Title,
  );
  assert.equal(
    alertDialog.AlertDialogDescription({ children: "Effetto" }).type,
    RadixAlertDialog.Description,
  );
  assert.equal(
    alertDialog.AlertDialogCancel({ children: "Annulla" }).type,
    RadixAlertDialog.Cancel,
  );

  const contentTree = dialog.DialogContent({ children: "Contenuto" });
  const [, content] = React.Children.toArray(contentTree.props.children);
  const [, close] = React.Children.toArray(content.props.children);
  assert.equal(content.type, RadixDialog.Content);
  assert.equal(close.type, RadixDialog.Close);
  assert.equal(close.props["aria-label"], "Chiudi");
});
