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

  function localRequire(specifier) {
    if (overrides.has(specifier)) return overrides.get(specifier);
    if (specifier.startsWith("@/")) {
      const resolved = path.resolve(projectRoot, specifier.slice(2));
      for (const extension of ["", ".ts", ".tsx"]) {
        const candidate = `${resolved}${extension}`;
        try {
          return loadProjectModule(path.relative(projectRoot, candidate), overrides, cache);
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

const FAMILY_ID = "10000000-0000-4000-8000-000000000010";
const COMPONENT_ID = "20000000-0000-4000-8000-000000000020";
const UNIT_ID = "30000000-0000-4000-8000-000000000030";
const CATEGORY_ID = "40000000-0000-4000-8000-000000000040";
const SECOND_CATEGORY_ID = "50000000-0000-4000-8000-000000000050";
const DIALOG_OVERRIDES = new Map([
  ["@/components/ui/dialog", {
    DialogHeader: ({ children }) => React.createElement("header", null, children),
    DialogTitle: ({ children }) => React.createElement("h2", null, children),
    DialogDescription: ({ children }) => React.createElement("p", null, children),
    DialogFooter: ({ children }) => React.createElement("footer", null, children),
  }],
  ["@/components/ui/alert-dialog", {
    AlertDialogHeader: ({ children }) => React.createElement("header", null, children),
    AlertDialogTitle: ({ children }) => React.createElement("h2", null, children),
    AlertDialogDescription: ({ children }) => React.createElement("p", null, children),
    AlertDialogFooter: ({ children }) => React.createElement("footer", null, children),
    AlertDialogCancel: ({ children }) => React.createElement(
      "span",
      { "data-alert-dialog-cancel": "" },
      children,
    ),
  }],
]);

test("category create form exposes every editable field and the shared icon select", () => {
  const { CatalogEntityForm } = loadProjectModule(
    "components/admin/catalog/catalog-entity-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogEntityForm, {
    entityType: "categorie",
    entity: null,
    families: [],
    pending: false,
    error: null,
    onSubmit() {},
    onCancel() {},
  }));

  assert.match(markup, /Nuova categoria/u);
  assert.match(markup, /<label[^>]*for="catalog-entity-code"[^>]*>Codice/u);
  assert.match(markup, /<label[^>]*for="catalog-entity-name"[^>]*>Nome/u);
  assert.match(markup, /<label[^>]*for="catalog-entity-subtitle"[^>]*>Sottotitolo/u);
  assert.match(markup, /<label[^>]*for="catalog-entity-icon"[^>]*>Icona/u);
  assert.match(markup, /data-catalog-icon="boxes"/u);
  assert.match(markup, /<label[^>]*for="catalog-entity-sort-order"[^>]*>Ordine/u);
  assert.match(markup, /<label[^>]*for="catalog-entity-active"/u);
  assert.match(markup, />Annulla</u);
  assert.match(markup, />Crea categoria</u);
});

test("family edit form is initialized from the selected entity", () => {
  const { CatalogEntityForm } = loadProjectModule(
    "components/admin/catalog/catalog-entity-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogEntityForm, {
    entityType: "famiglie",
    entity: {
      kind: "famiglia",
      id: FAMILY_ID,
      sourceCode: "F-01",
      name: "Valvole",
      subtitle: "Processo",
      iconKey: "wrench",
      sortOrder: 7,
      isActive: false,
    },
    families: [],
    pending: false,
    error: null,
    onSubmit() {},
    onCancel() {},
  }));

  assert.match(markup, /Modifica famiglia/u);
  assert.match(markup, /value="F-01"/u);
  assert.match(markup, /value="Valvole"/u);
  assert.match(markup, /value="Processo"/u);
  assert.match(markup, /data-catalog-icon="wrench"/u);
  assert.match(markup, /value="7"/u);
  assert.match(markup, />Salva modifiche</u);
});

test("component form requires a family and keeps inactive families visible", () => {
  const { CatalogEntityForm } = loadProjectModule(
    "components/admin/catalog/catalog-entity-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogEntityForm, {
    entityType: "componenti",
    entity: null,
    families: [{ id: FAMILY_ID, name: "Valvole", isActive: false }],
    pending: false,
    error: null,
    onSubmit() {},
    onCancel() {},
  }));

  assert.match(markup, /Nuovo componente/u);
  assert.match(markup, /<label[^>]*for="catalog-entity-family"[^>]*>Famiglia/u);
  assert.match(markup, /<select[^>]*id="catalog-entity-family"[^>]*required/u);
  assert.match(markup, /value="10000000-0000-4000-8000-000000000010"/u);
  assert.match(markup, /Valvole \(inattiva\)/u);
  assert.match(markup, /<label[^>]*for="catalog-entity-description"[^>]*>Descrizione/u);
});

test("component form offers a discreet inline family creator without nesting forms", () => {
  const { CatalogEntityForm } = loadProjectModule(
    "components/admin/catalog/catalog-entity-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogEntityForm, {
    entityType: "componenti",
    entity: null,
    families: [],
    pending: false,
    error: null,
    onSubmit() {},
    onCancel() {},
    onQuickCreateFamily() {},
  }));

  assert.match(markup, />Nuova famiglia</u);
  assert.equal((markup.match(/<form\b/gu) ?? []).length, 1);
});

test("entity form announces errors, disables submission while pending and keeps cancel focusable", () => {
  const { CatalogEntityForm } = loadProjectModule(
    "components/admin/catalog/catalog-entity-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogEntityForm, {
    entityType: "categorie",
    entity: null,
    families: [],
    pending: true,
    error: "Esiste già una categoria con questo codice.",
    onSubmit() {},
    onCancel() {},
  }));

  assert.match(markup, /role="alert"/u);
  assert.match(markup, /aria-live="polite"/u);
  assert.match(markup, /Esiste già una categoria con questo codice/u);
  assert.match(markup, /<button[^>]*type="submit"[^>]*disabled/u);
  assert.match(markup, /Salvataggio/u);
  assert.match(markup, /<button[^>]*type="button"[^>]*>Annulla/u);
});

test("variant form exposes every editable field and visibly selected categories", () => {
  const { CatalogVariantForm } = loadProjectModule(
    "components/admin/catalog/catalog-variant-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogVariantForm, {
    entity: {
      kind: "variante",
      id: FAMILY_ID,
      componentId: COMPONENT_ID,
      fabtekCode: "FT-001",
      oracleSapioCode: "ORA-01",
      description: "Tubo PTFE",
      diameter: "12 mm",
      material: "PTFE",
      connection: "1/2 NPT",
      unitOfMeasureId: UNIT_ID,
      trackInventory: true,
      sortOrder: 4,
      isActive: false,
      component: {
        id: COMPONENT_ID,
        name: "Tubo",
        isActive: true,
        familyId: FAMILY_ID,
        family: { id: FAMILY_ID, name: "Tubazioni", isActive: true },
      },
      unitOfMeasure: { id: UNIT_ID, code: "PZ", name: "Pezzi", isActive: true },
      categories: [{ id: CATEGORY_ID, code: "CAT-PRO", name: "Processo", isActive: true }],
    },
    options: {
      categories: [
        { id: CATEGORY_ID, code: "CAT-PRO", name: "Processo", isActive: true },
        { id: FAMILY_ID, code: "CAT-RIC", name: "Ricambi", isActive: false },
      ],
      families: [],
      components: [{
        id: COMPONENT_ID,
        name: "Tubo",
        isActive: true,
        familyId: FAMILY_ID,
        family: { id: FAMILY_ID, name: "Tubazioni", isActive: true },
      }],
      unitsOfMeasure: [{ id: UNIT_ID, code: "PZ", name: "Pezzi", isActive: true }],
    },
    categoryIds: [CATEGORY_ID],
    isActive: false,
    trackInventory: true,
    pending: false,
    error: null,
    onCategoryChange() {},
    onActiveChange() {},
    onInventoryChange() {},
    onSubmit() {},
    onCancel() {},
  }));

  assert.match(markup, /Modifica variante/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-component"[^>]*>Componente/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-fabtek-code"[^>]*>Codice Fabtek/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-oracle-code"[^>]*>Codice Oracle\/SAPIO/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-description"[^>]*>Descrizione/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-diameter"[^>]*>Diametro/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-material"[^>]*>Materiale/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-connection"[^>]*>Connessione/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-unit"[^>]*>Unità di misura/u);
  assert.match(markup, /<fieldset[^>]*aria-describedby="catalog-variant-categories-help"/u);
  assert.match(markup, /<legend[^>]*>Categorie/u);
  const selectedCategoryInput = markup.match(
    /<input[^>]*name="categoryIds"[^>]*checked=""[^>]*value="40000000-0000-4000-8000-000000000040"[^>]*>/u,
  )?.[0] ?? "";
  assert.match(selectedCategoryInput, /type="checkbox"/u);
  assert.match(markup, /1 categoria selezionata/u);
  assert.match(markup, /Processo/u);
  assert.match(markup, /Ricambi \(inattiva\)/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-track-inventory"/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-sort-order"[^>]*>Ordine/u);
  assert.match(markup, /<label[^>]*for="catalog-variant-active"/u);
});

test("variant form offers only the three inline quick-create entry points", () => {
  const { CatalogVariantForm } = loadProjectModule(
    "components/admin/catalog/catalog-variant-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogVariantForm, {
    entity: null,
    options: { categories: [], families: [], components: [], unitsOfMeasure: [] },
    categoryIds: [],
    isActive: true,
    trackInventory: false,
    pending: false,
    error: null,
    onCategoryChange() {},
    onActiveChange() {},
    onInventoryChange() {},
    onSubmit() {},
    onCancel() {},
    onQuickCreateComponent() {},
    onQuickCreateCategory() {},
    onQuickCreateUnit() {},
  }));

  assert.equal((markup.match(/<form\b/gu) ?? []).length, 1);
  assert.equal((markup.match(/>Nuovo componente</gu) ?? []).length, 1);
  assert.equal((markup.match(/>Nuova categoria</gu) ?? []).length, 1);
  assert.equal((markup.match(/>Nuova unità</gu) ?? []).length, 1);
});

test("new technical icons render through the shared picker registry", () => {
  const { CatalogIcon } = loadProjectModule("components/catalog/catalog-icon.tsx");

  for (const iconKey of ["bolt", "circuit-board", "cog", "fan", "filter", "pipette", "shield-check", "thermometer"]) {
    assert.equal(CATALOG_ICON_KEYS.includes(iconKey), true);
    const markup = renderToStaticMarkup(React.createElement(CatalogIcon, { iconKey }));
    assert.match(markup, new RegExp(`data-catalog-icon="${iconKey}"`, "u"));
  }
});

test("quick unit creator sends only essential normalized fields and returns the selectable option", async () => {
  let CatalogQuickCreate;
  assert.doesNotThrow(() => {
    ({ CatalogQuickCreate } = loadProjectModule(
      "components/admin/catalog/catalog-quick-create.tsx",
      new Map([["sonner", { toast: { success() {} } }]]),
    ));
  });
  const harness = createHookHarness();
  const events = [];
  const overrides = new Map([
    ["react", harness.react],
    ["sonner", { toast: { success() {} } }],
  ]);
  ({ CatalogQuickCreate } = loadProjectModule(
    "components/admin/catalog/catalog-quick-create.tsx",
    overrides,
  ));
  const props = {
    kind: "unit",
    families: [],
    async create(input) {
      events.push(["create", input]);
      return { ok: true, data: { id: UNIT_ID } };
    },
    onCreated(option) { events.push(["created", option]); },
  };

  let rendered = harness.render(CatalogQuickCreate, props);
  const trigger = findElement(rendered.tree, (element) => (
    React.Children.toArray(element.props.children).includes("Nuova unità")
  ));
  trigger.props.onClick();
  rendered = harness.render(CatalogQuickCreate, props);
  findElement(rendered.tree, (element) => element.props.id === "quick-create-unit-code")
    .props.onChange({ target: { value: " kg " } });
  findElement(rendered.tree, (element) => element.props.id === "quick-create-unit-name")
    .props.onChange({ target: { value: " Chilogrammi " } });
  findElement(rendered.tree, (element) => element.props.id === "quick-create-unit-fraction")
    .props.onChange({ target: { checked: true } });
  rendered = harness.render(CatalogQuickCreate, props);
  const save = findElement(rendered.tree, (element) => element.props.children === "Aggiungi");
  save.props.onClick();
  await Promise.all(harness.transitions);

  assert.deepEqual(events, [
    ["create", { code: "kg", name: "Chilogrammi", allowsFraction: true }],
    ["created", { id: UNIT_ID, code: "kg", name: "Chilogrammi", isActive: true }],
  ]);
});

test("quick family creator settles after syncing its omitted families default", () => {
  const harness = createHookHarness();
  const overrides = new Map([
    ["react", harness.react],
    ["sonner", { toast: { success() {} } }],
  ]);
  const { CatalogQuickCreate } = loadProjectModule(
    "components/admin/catalog/catalog-quick-create.tsx",
    overrides,
  );
  const props = {
    kind: "family",
    async create() { return { ok: true, data: { id: FAMILY_ID } }; },
    onCreated() {},
  };

  const initialRender = harness.render(CatalogQuickCreate, props);
  initialRender.flushEffects();
  const settledRender = harness.render(CatalogQuickCreate, props);

  assert.equal(settledRender.effectCount, 0);
});

test("variant dialog appends and selects every relation created inline", () => {
  const harness = createHookHarness();
  function QuickCreate() { return null; }
  const overrides = new Map([
    ["react", harness.react],
    ["@/components/admin/catalog/catalog-quick-create", { CatalogQuickCreate: QuickCreate }],
    ["@/components/ui/dialog", {
      Dialog: ({ children }) => children,
      DialogContent: ({ children }) => children,
      DialogHeader: ({ children }) => children,
      DialogTitle: ({ children }) => children,
      DialogDescription: ({ children }) => children,
      DialogFooter: ({ children }) => children,
    }],
    ["sonner", { toast: { success() {} } }],
  ]);
  const { CatalogVariantDialog, CatalogVariantForm } = loadProjectModule(
    "components/admin/catalog/catalog-variant-dialog.tsx",
    overrides,
  );
  const family = { id: FAMILY_ID, name: "Tubazioni", isActive: true };
  const props = {
    open: true,
    onOpenChange() {},
    entity: null,
    options: { categories: [], families: [family], components: [], unitsOfMeasure: [] },
    async save() { return { ok: true, data: { id: COMPONENT_ID } }; },
    async saveCategory() { return { ok: true, data: { id: CATEGORY_ID } }; },
    async saveFamily() { return { ok: true, data: { id: FAMILY_ID } }; },
    async saveComponent() { return { ok: true, data: { id: COMPONENT_ID } }; },
    async saveUnit() { return { ok: true, data: { id: UNIT_ID } }; },
  };

  let rendered = harness.render(CatalogVariantDialog, props);
  let form = findElement(rendered.tree, (element) => element.type === CatalogVariantForm);
  let creators = [
    form.props.quickCreateComponent,
    form.props.quickCreateUnit,
    form.props.quickCreateCategory,
  ];
  assert.deepEqual(creators.map((creator) => creator.props.kind), ["component", "unit", "category"]);
  creators.find((creator) => creator.props.kind === "component").props.onCreated({
    id: COMPONENT_ID,
    name: "Tubo",
    isActive: true,
    familyId: FAMILY_ID,
    family,
  });
  creators.find((creator) => creator.props.kind === "unit").props.onCreated({
    id: UNIT_ID,
    code: "kg",
    name: "Chilogrammi",
    isActive: true,
  });
  creators.find((creator) => creator.props.kind === "category").props.onCreated({
    id: CATEGORY_ID,
    code: "GAS",
    name: "Gas",
    isActive: true,
  });

  rendered = harness.render(CatalogVariantDialog, props);
  form = findElement(rendered.tree, (element) => element.type === CatalogVariantForm);
  assert.equal(form.props.componentId, COMPONENT_ID);
  assert.equal(form.props.unitOfMeasureId, UNIT_ID);
  assert.deepEqual(form.props.categoryIds, [CATEGORY_ID]);
  assert.equal(form.props.options.components[0].name, "Tubo");
  assert.equal(form.props.options.unitsOfMeasure[0].code, "kg");
  assert.equal(form.props.options.categories[0].code, "GAS");
});

test("component dialog appends and selects a family created inline", () => {
  const harness = createHookHarness();
  function QuickCreate() { return null; }
  const overrides = new Map([
    ["react", harness.react],
    ["@/components/admin/catalog/catalog-quick-create", { CatalogQuickCreate: QuickCreate }],
    ["@/components/ui/dialog", {
      Dialog: ({ children }) => children,
      DialogContent: ({ children }) => children,
      DialogHeader: ({ children }) => children,
      DialogTitle: ({ children }) => children,
      DialogDescription: ({ children }) => children,
      DialogFooter: ({ children }) => children,
    }],
    ["sonner", { toast: { success() {} } }],
  ]);
  const { CatalogEntityDialog, CatalogEntityForm } = loadProjectModule(
    "components/admin/catalog/catalog-entity-dialog.tsx",
    overrides,
  );
  const props = {
    open: true,
    onOpenChange() {},
    entityType: "componenti",
    entity: null,
    families: [],
    async save() { return { ok: true, data: { id: COMPONENT_ID } }; },
    async saveFamily() { return { ok: true, data: { id: FAMILY_ID } }; },
  };

  let rendered = harness.render(CatalogEntityDialog, props);
  let form = findElement(rendered.tree, (element) => element.type === CatalogEntityForm);
  const creator = form.props.quickCreateFamily;
  assert.equal(creator.props.kind, "family");
  creator.props.onCreated({ id: FAMILY_ID, name: "Tubazioni", isActive: true });
  rendered = harness.render(CatalogEntityDialog, props);
  form = findElement(rendered.tree, (element) => element.type === CatalogEntityForm);
  assert.equal(form.props.familyId, FAMILY_ID);
  assert.equal(form.props.families[0].name, "Tubazioni");
});

test("variant toggles make the complete 40px row their checkbox label", () => {
  const { CatalogVariantForm } = loadProjectModule(
    "components/admin/catalog/catalog-variant-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogVariantForm, {
    entity: null,
    options: { categories: [], families: [], components: [], unitsOfMeasure: [] },
    categoryIds: [],
    isActive: true,
    trackInventory: false,
    pending: false,
    error: null,
    onCategoryChange() {},
    onActiveChange() {},
    onInventoryChange() {},
    onSubmit() {},
    onCancel() {},
  }));

  for (const id of ["catalog-variant-track-inventory", "catalog-variant-active"]) {
    const label = markup.match(
      new RegExp(`<label[^>]*for="${id}"[^>]*class="[^"]*min-h-10[^"]*"[^>]*>[\\s\\S]*?</label>`, "u"),
    )?.[0] ?? "";
    assert.match(label, new RegExp(`<input[^>]*id="${id}"[^>]*type="checkbox"`, "u"));
    assert.doesNotMatch(label, /<(?:button|a|select|textarea)\b/u);
  }
});

test("variant category names without spaces cannot widen the mobile dialog", () => {
  const { CatalogVariantForm } = loadProjectModule(
    "components/admin/catalog/catalog-variant-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const longName = "A".repeat(160);
  const markup = renderToStaticMarkup(React.createElement(CatalogVariantForm, {
    entity: null,
    options: {
      categories: [{ id: CATEGORY_ID, code: "CAT-LONG", name: longName, isActive: true }],
      families: [],
      components: [],
      unitsOfMeasure: [],
    },
    categoryIds: [CATEGORY_ID],
    isActive: true,
    trackInventory: false,
    pending: false,
    error: null,
    onCategoryChange() {},
    onActiveChange() {},
    onInventoryChange() {},
    onSubmit() {},
    onCancel() {},
  }));

  assert.match(markup, new RegExp(`>CAT-LONG — ${longName}<`, "u"));
  assert.match(
    markup,
    /id="catalog-variant-categories-help" class="[^"]*min-w-0[^"]*break-words[^"]*\[overflow-wrap:anywhere\]/u,
  );
  assert.match(markup, /class="[^"]*grid[^"]*min-w-0[^"]*overflow-y-auto/u);
  assert.match(
    markup,
    /for="catalog-variant-category-[^"]+" class="[^"]*min-w-0[^"]*"/u,
  );
  assert.match(
    markup,
    /<span class="[^"]*min-w-0[^"]*break-words[^"]*\[overflow-wrap:anywhere\][^"]*">CAT-LONG — A{160}<\/span>/u,
  );
});

test("variant pending state stops spinner motion and uses a Unicode ellipsis", () => {
  const { CatalogVariantForm } = loadProjectModule(
    "components/admin/catalog/catalog-variant-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogVariantForm, {
    entity: null,
    options: {
      categories: [{ id: CATEGORY_ID, code: "CAT-PRO", name: "Processo", isActive: true }],
      families: [],
      components: [],
      unitsOfMeasure: [],
    },
    categoryIds: [CATEGORY_ID],
    isActive: true,
    trackInventory: false,
    pending: true,
    error: null,
    onCategoryChange() {},
    onActiveChange() {},
    onInventoryChange() {},
    onSubmit() {},
    onCancel() {},
  }));
  const submitButton = markup.match(/<button[^>]*type="submit"[^>]*>[\s\S]*?<\/button>/u)?.[0] ?? "";

  assert.match(submitButton, /class="[^"]*animate-spin[^"]*motion-reduce:animate-none/u);
  assert.match(submitButton, /Salvataggio…/u);
  assert.doesNotMatch(submitButton, /Salvataggio\.\.\./u);
});

test("same-name categories expose their codes and submit only the selected UUID", async () => {
  const saves = [];
  let transition;
  const fakeReact = {
    ...React,
    useEffect() {},
    useState(initialValue) {
      return [typeof initialValue === "function" ? initialValue() : initialValue, () => {}];
    },
    useTransition() {
      return [false, (callback) => { transition = Promise.resolve(callback()); }];
    },
  };
  const overrides = new Map([
    ["react", fakeReact],
    ["sonner", { toast: { success() {} } }],
    ["@/components/ui/dialog", {
      Dialog: ({ children }) => children,
      DialogContent: ({ children }) => children,
      DialogHeader: ({ children }) => children,
      DialogTitle: ({ children }) => children,
      DialogDescription: ({ children }) => children,
      DialogFooter: ({ children }) => children,
    }],
  ]);
  const { CatalogVariantDialog } = loadProjectModule(
    "components/admin/catalog/catalog-variant-dialog.tsx",
    overrides,
  );
  const sharedCategory = { name: "Processo", isActive: true };
  const categories = [
    { ...sharedCategory, id: CATEGORY_ID, code: "CAT-A" },
    { ...sharedCategory, id: SECOND_CATEGORY_ID, code: "CAT-B" },
  ];
  const entity = {
    kind: "variante",
    id: FAMILY_ID,
    componentId: COMPONENT_ID,
    fabtekCode: "FT-001",
    oracleSapioCode: null,
    description: "Tubo PTFE",
    diameter: null,
    material: "PTFE",
    connection: "1/2 NPT",
    unitOfMeasureId: UNIT_ID,
    trackInventory: false,
    sortOrder: 1,
    isActive: true,
    component: {
      id: COMPONENT_ID,
      name: "Tubo",
      isActive: true,
      familyId: FAMILY_ID,
      family: { id: FAMILY_ID, name: "Tubazioni", isActive: true },
    },
    unitOfMeasure: { id: UNIT_ID, code: "PZ", name: "Pezzi", isActive: true },
    categories: [categories[1]],
  };
  const tree = CatalogVariantDialog({
    open: true,
    onOpenChange() {},
    entity,
    options: {
      categories,
      families: [],
      components: [entity.component],
      unitsOfMeasure: [entity.unitOfMeasure],
    },
    async save(input) {
      saves.push(input);
      return { ok: true, data: { id: FAMILY_ID } };
    },
  });
  const content = tree.props.children;
  const form = content.props.children;
  const markup = renderToStaticMarkup(form);

  assert.match(markup, /CAT-A — Processo/u);
  assert.match(markup, /CAT-B — Processo/u);
  const selectedInput = markup.match(
    /<input[^>]*name="categoryIds"[^>]*checked=""[^>]*value="50000000-0000-4000-8000-000000000050"[^>]*>/u,
  )?.[0] ?? "";
  assert.match(selectedInput, /type="checkbox"/u);

  const originalFormData = globalThis.FormData;
  globalThis.FormData = class FakeFormData {
    constructor(formValue) { this.form = formValue; }
    get(name) { return this.form[name] ?? null; }
  };
  try {
    form.props.onSubmit({
      preventDefault() {},
      currentTarget: {
        componentId: COMPONENT_ID,
        fabtekCode: "FT-001",
        oracleSapioCode: "",
        description: "Tubo PTFE",
        diameter: "",
        material: "PTFE",
        connection: "1/2 NPT",
        unitOfMeasureId: UNIT_ID,
        sortOrder: "1",
      },
    });
    await transition;
  } finally {
    globalThis.FormData = originalFormData;
  }

  assert.deepEqual(saves[0].categoryIds, [SECOND_CATEGORY_ID]);
});

test("successful entity save shows a toast and closes the controlled dialog", async () => {
  const events = [];
  let transition;
  const fakeReact = {
    ...React,
    useEffect() {},
    useState(initialValue) {
      return [initialValue, (value) => events.push(["state", value])];
    },
    useTransition() {
      return [false, (callback) => { transition = Promise.resolve(callback()); }];
    },
  };
  const overrides = new Map([
    ["react", fakeReact],
    ["sonner", { toast: { success(message) { events.push(["toast", message]); } } }],
    ["@/components/ui/dialog", {
      Dialog: ({ children }) => children,
      DialogContent: ({ children }) => children,
      DialogHeader: ({ children }) => children,
      DialogTitle: ({ children }) => children,
      DialogDescription: ({ children }) => children,
      DialogFooter: ({ children }) => children,
    }],
  ]);
  const { CatalogEntityDialog } = loadProjectModule(
    "components/admin/catalog/catalog-entity-dialog.tsx",
    overrides,
  );
  const originalFormData = globalThis.FormData;
  globalThis.FormData = class FakeFormData {
    constructor(form) { this.form = form; }
    get(name) { return this.form[name] ?? null; }
  };

  try {
    const tree = CatalogEntityDialog({
      open: true,
      onOpenChange(open) { events.push(["open", open]); },
      entityType: "categorie",
      entity: null,
      families: [],
      async save(input) {
        events.push(["save", input]);
        return { ok: true, data: { id: FAMILY_ID } };
      },
    });
    const content = tree.props.children;
    const form = content.props.children;
    form.props.onSubmit({
      preventDefault() {},
      currentTarget: {
        name: "Pompe",
        code: "CAT-01",
        subtitle: "Processo",
        sortOrder: "4",
      },
    });
    await transition;
  } finally {
    globalThis.FormData = originalFormData;
  }

  assert.deepEqual(events.find(([event]) => event === "save")?.[1], {
    id: null,
    name: "Pompe",
    iconKey: "boxes",
    sortOrder: "4",
    isActive: true,
    code: "CAT-01",
    subtitle: "Processo",
  });
  assert.deepEqual(events.filter(([event]) => event === "toast"), [
    ["toast", "Categoria salvata."],
  ]);
  assert.deepEqual(events.filter(([event]) => event === "open"), [["open", false]]);
});

test("referenced delete response changes the primary action to an explicit deactivation", () => {
  const { CatalogDeleteDialogBody } = loadProjectModule(
    "components/admin/catalog/catalog-delete-dialog.tsx",
    DIALOG_OVERRIDES,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogDeleteDialogBody, {
    entityName: "Valvole",
    mode: "delete",
    referenced: true,
    currentIsActive: true,
    pending: false,
    error: null,
    onCancel() {},
    onConfirm() {},
  }));

  assert.match(markup, /non può essere eliminata perché è utilizzata/u);
  assert.match(markup, /Puoi disattivarla/u);
  assert.match(markup, /data-alert-dialog-cancel=""/u);
  assert.match(markup, /<button[^>]*type="button"[^>]*>Annulla/u);
  assert.match(markup, /<button[^>]*type="button"[^>]*>Disattiva/u);
  assert.doesNotMatch(markup, />Elimina</u);
});

test("a referenced inactive entity can only close and cannot execute a no-op deactivation", async () => {
  const harness = createHookHarness();
  const deleteCalls = [];
  const deactivateCalls = [];
  function AlertDialog({ children }) { return children; }
  function AlertDialogContent({ children }) { return children; }
  const overrides = new Map([
    ["react", harness.react],
    ["@/components/ui/alert-dialog", {
      AlertDialog,
      AlertDialogContent,
      AlertDialogHeader: ({ children }) => children,
      AlertDialogTitle: ({ children }) => children,
      AlertDialogDescription: ({ children }) => children,
      AlertDialogFooter: ({ children }) => children,
      AlertDialogCancel: ({ children }) => children,
    }],
  ]);
  const { CatalogDeleteDialog } = loadProjectModule(
    "components/admin/catalog/catalog-delete-dialog.tsx",
    overrides,
  );
  const props = {
    open: true,
    onOpenChange() {},
    entity: "categorie",
    entityId: FAMILY_ID,
    entityName: "Pompe",
    mode: "delete",
    currentIsActive: false,
    async deleteEntity(input) {
      deleteCalls.push(input);
      return {
        ok: false,
        error: {
          code: "CATALOG_ENTITY_REFERENCED",
          message: "La voce è utilizzata e non può essere eliminata.",
        },
      };
    },
    async setActive(input) {
      deactivateCalls.push(input);
      return { ok: true, data: { id: FAMILY_ID } };
    },
  };

  let rendered = harness.render(CatalogDeleteDialog, props);
  rendered.flushEffects();
  let body = rendered.tree.props.children.props.children;
  body.props.onConfirm();
  await Promise.all(harness.transitions);

  rendered = harness.render(CatalogDeleteDialog, props);
  body = rendered.tree.props.children.props.children;
  const markup = renderToStaticMarkup(body);
  assert.match(markup, /già inattiva/u);
  assert.match(markup, />Chiudi</u);
  assert.doesNotMatch(markup, />Disattiva</u);
  assert.doesNotMatch(markup, />Elimina</u);

  body.props.onConfirm();
  await Promise.all(harness.transitions);
  assert.equal(deleteCalls.length, 1);
  assert.deepEqual(deactivateCalls, []);
});

test("catalog management exposes group CRUD actions in desktop and mobile layouts", () => {
  function Link({ href, children, ...props }) {
    return React.createElement("a", { href, ...props }, children);
  }
  const overrides = new Map([
    ["next/link", Link],
    ["@/app/(app)/admin/catalogo/actions", {
      async saveCategoryAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async saveFamilyAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async saveComponentAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async deleteCatalogEntityAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async setCatalogEntityActiveAction() { return { ok: true, data: { id: FAMILY_ID } }; },
    }],
    ["@/components/admin/catalog/catalog-entity-dialog", {
      CatalogEntityDialog() { return null; },
    }],
    ["@/components/admin/catalog/catalog-delete-dialog", {
      CatalogDeleteDialog() { return null; },
    }],
  ]);
  const { CatalogManagement } = loadProjectModule(
    "components/admin/catalog/catalog-management.tsx",
    overrides,
  );
  const markup = renderToStaticMarkup(React.createElement(CatalogManagement, {
    query: { tab: "categorie", query: "pompe", status: "tutti", page: 1 },
    result: {
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{
        kind: "categoria",
        id: FAMILY_ID,
        code: "CAT-01",
        name: "Pompe",
        subtitle: "Processo",
        iconKey: "factory",
        sortOrder: 4,
        isActive: true,
      }],
    },
    formOptions: { categories: [], families: [], components: [], unitsOfMeasure: [] },
  }));

  const createButton = markup.match(/<button[^>]*type="button"[^>]*>[\s\S]*?Nuovo<\/button>/u)?.[0] ?? "";
  assert.match(createButton, /Nuovo/u);
  assert.doesNotMatch(
    createButton.match(/^<button[^>]*>/u)?.[0] ?? "",
    /\sdisabled(?:=|\s|>)/u,
  );
  assert.equal((markup.match(/>Modifica</gu) ?? []).length, 2);
  assert.equal((markup.match(/>Disattiva</gu) ?? []).length, 2);
  assert.equal((markup.match(/>Elimina</gu) ?? []).length, 2);
  assert.match(markup, /class="[^"]*hidden[^"]*md:block/u);
  assert.match(markup, /class="[^"]*md:hidden/u);
});

function findElement(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

function createHookHarness() {
  const slots = [];
  const transitions = [];
  let cursor = 0;
  let effects = [];

  function nextSlot(initialValue) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initialValue;
    return [index, slots[index]];
  }

  const react = {
    ...React,
    useState(initialValue) {
      const [index, value] = nextSlot(
        typeof initialValue === "function" ? initialValue() : initialValue,
      );
      return [value, (nextValue) => {
        slots[index] = typeof nextValue === "function"
          ? nextValue(slots[index])
          : nextValue;
      }];
    },
    useRef(initialValue) {
      const [index] = nextSlot({ current: initialValue });
      return slots[index];
    },
    useEffect(callback, dependencies) {
      const [index, previous] = nextSlot(undefined);
      const changed = previous === undefined
        || dependencies === undefined
        || dependencies.some((value, dependencyIndex) => !Object.is(value, previous[dependencyIndex]));
      slots[index] = dependencies;
      if (changed) effects.push(callback);
    },
    useTransition() {
      nextSlot(null);
      return [false, (callback) => {
        const transition = Promise.resolve(callback());
        transitions.push(transition);
      }];
    },
  };

  return {
    react,
    transitions,
    render(Component, props) {
      cursor = 0;
      effects = [];
      const tree = Component(props);
      const currentEffects = effects;
      return {
        tree,
        effectCount: currentEffects.length,
        flushEffects() {
          for (const effect of currentEffects) effect();
        },
      };
    },
  };
}

function managementFixture(tab, item) {
  return {
    query: { tab, query: "", status: "tutti", page: 1 },
    result: { page: 1, pageSize: 20, total: 1, items: [item] },
    formOptions: { categories: [], families: [], components: [], unitsOfMeasure: [] },
  };
}

test("variant rows expose CRUD controls and open the variant editor with its options", async () => {
  const harness = createHookHarness();
  const calls = [];
  function Link({ href, children, ...props }) {
    return React.createElement("a", { href, ...props }, children);
  }
  function EntityDialog() { return null; }
  function VariantDialog() { return null; }
  const overrides = new Map([
    ["react", harness.react],
    ["next/link", Link],
    ["@/app/(app)/admin/catalogo/actions", {
      async saveCategoryAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async saveFamilyAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async saveComponentAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async saveVariantAction(input) {
        calls.push(input);
        return { ok: true, data: { id: FAMILY_ID } };
      },
      async deleteCatalogEntityAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async setCatalogEntityActiveAction() { return { ok: true, data: { id: FAMILY_ID } }; },
    }],
    ["@/components/admin/catalog/catalog-entity-dialog", { CatalogEntityDialog: EntityDialog }],
    ["@/components/admin/catalog/catalog-variant-dialog", { CatalogVariantDialog: VariantDialog }],
    ["@/components/admin/catalog/catalog-delete-dialog", { CatalogDeleteDialog() { return null; } }],
  ]);
  const { CatalogManagement } = loadProjectModule(
    "components/admin/catalog/catalog-management.tsx",
    overrides,
  );
  const variant = {
    kind: "variante",
    id: FAMILY_ID,
    componentId: COMPONENT_ID,
    fabtekCode: "FT-001",
    oracleSapioCode: null,
    description: "Tubo PTFE",
    diameter: null,
    material: "PTFE",
    connection: "1/2 NPT",
    unitOfMeasureId: UNIT_ID,
    trackInventory: false,
    sortOrder: 1,
    isActive: true,
    component: {
      id: COMPONENT_ID,
      name: "Tubo",
      isActive: true,
      familyId: FAMILY_ID,
      family: { id: FAMILY_ID, name: "Tubazioni", isActive: true },
    },
    unitOfMeasure: { id: UNIT_ID, code: "PZ", name: "Pezzi", isActive: true },
    categories: [{ id: CATEGORY_ID, code: "CAT-PRO", name: "Processo", isActive: true }],
  };
  const options = {
    categories: variant.categories,
    families: [],
    components: [variant.component],
    unitsOfMeasure: [variant.unitOfMeasure],
  };
  const props = {
    ...managementFixture("varianti", variant),
    formOptions: options,
  };

  let rendered = harness.render(CatalogManagement, props);
  rendered.flushEffects();
  let rows = findElement(rendered.tree, (element) => element.type.name === "CatalogRows");
  const rowMarkup = renderToStaticMarkup(rows.type(rows.props));
  assert.match(rowMarkup, />Modifica</u);
  assert.match(rowMarkup, />Disattiva</u);
  assert.match(rowMarkup, />Elimina</u);

  rows.props.onEdit(variant);
  rendered = harness.render(CatalogManagement, props);
  const dialog = findElement(rendered.tree, (element) => element.type === VariantDialog);
  assert.equal(dialog.props.entity, variant);
  assert.equal(dialog.props.options, options);
  await dialog.props.save({ id: FAMILY_ID, fabtekCode: "FT-001" });
  assert.deepEqual(calls, [{ id: FAMILY_ID, fabtekCode: "FT-001" }]);
});

test("open editor keeps its originating entity across Back/Forward and then resets", async () => {
  const harness = createHookHarness();
  const calls = [];
  function Link({ href, children, ...props }) {
    return React.createElement("a", { href, ...props }, children);
  }
  function EntityDialog() { return null; }
  function DeleteDialog() { return null; }
  const overrides = new Map([
    ["react", harness.react],
    ["next/link", Link],
    ["@/app/(app)/admin/catalogo/actions", {
      async saveCategoryAction(input) {
        calls.push(["save-category", input]);
        return { ok: true, data: { id: FAMILY_ID } };
      },
      async saveFamilyAction(input) {
        calls.push(["save-family", input]);
        return { ok: true, data: { id: FAMILY_ID } };
      },
      async saveComponentAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async deleteCatalogEntityAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async setCatalogEntityActiveAction() { return { ok: true, data: { id: FAMILY_ID } }; },
    }],
    ["@/components/admin/catalog/catalog-entity-dialog", { CatalogEntityDialog: EntityDialog }],
    ["@/components/admin/catalog/catalog-delete-dialog", { CatalogDeleteDialog: DeleteDialog }],
  ]);
  const { CatalogManagement } = loadProjectModule(
    "components/admin/catalog/catalog-management.tsx",
    overrides,
  );
  const category = {
    kind: "categoria",
    id: FAMILY_ID,
    code: "CAT-01",
    name: "Pompe",
    subtitle: null,
    iconKey: "factory",
    sortOrder: 1,
    isActive: true,
  };
  const familyWithSameId = {
    kind: "famiglia",
    id: FAMILY_ID,
    sourceCode: "F-01",
    name: "Valvole",
    subtitle: null,
    iconKey: "wrench",
    sortOrder: 1,
    isActive: true,
  };

  let rendered = harness.render(CatalogManagement, managementFixture("categorie", category));
  rendered.flushEffects();
  let rows = findElement(rendered.tree, (element) => element.type.name === "CatalogRows");
  rows.props.onEdit(category);
  rendered = harness.render(CatalogManagement, managementFixture("categorie", category));
  rendered.flushEffects();
  let dialog = findElement(rendered.tree, (element) => element.type === EntityDialog);
  assert.equal(dialog.props.open, true);
  assert.equal(dialog.props.entityType, "categorie");

  rendered = harness.render(
    CatalogManagement,
    managementFixture("famiglie", familyWithSameId),
  );
  dialog = findElement(rendered.tree, (element) => element.type === EntityDialog);
  assert.equal(dialog.props.entityType, "categorie");
  await dialog.props.save({ id: FAMILY_ID, name: "Pompe aggiornate" });
  assert.deepEqual(calls, [[
    "save-category",
    { id: FAMILY_ID, name: "Pompe aggiornate" },
  ]]);

  rendered.flushEffects();
  rendered = harness.render(
    CatalogManagement,
    managementFixture("famiglie", familyWithSameId),
  );
  dialog = findElement(rendered.tree, (element) => element.type === EntityDialog);
  assert.equal(dialog, null);

  rows = findElement(rendered.tree, (element) => element.type.name === "CatalogRows");
  rows.props.onEdit(familyWithSameId);
  rendered = harness.render(
    CatalogManagement,
    managementFixture("famiglie", familyWithSameId),
  );
  rendered.flushEffects();
  const searchedFixture = managementFixture("famiglie", familyWithSameId);
  searchedFixture.query.query = "valvole";
  rendered = harness.render(CatalogManagement, searchedFixture);
  dialog = findElement(rendered.tree, (element) => element.type === EntityDialog);
  assert.equal(dialog.props.entityType, "famiglie");
  rendered.flushEffects();
  rendered = harness.render(CatalogManagement, searchedFixture);
  assert.equal(
    findElement(rendered.tree, (element) => element.type === EntityDialog),
    null,
  );
});

test("delete confirmation keeps its originating table across a query change", async () => {
  const harness = createHookHarness();
  const calls = [];
  function Link({ href, children, ...props }) {
    return React.createElement("a", { href, ...props }, children);
  }
  function EntityDialog() { return null; }
  function DeleteDialog() { return null; }
  const overrides = new Map([
    ["react", harness.react],
    ["next/link", Link],
    ["@/app/(app)/admin/catalogo/actions", {
      async saveCategoryAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async saveFamilyAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async saveComponentAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async deleteCatalogEntityAction(input) {
        calls.push(input);
        return { ok: true, data: { id: FAMILY_ID } };
      },
      async setCatalogEntityActiveAction() { return { ok: true, data: { id: FAMILY_ID } }; },
    }],
    ["@/components/admin/catalog/catalog-entity-dialog", { CatalogEntityDialog: EntityDialog }],
    ["@/components/admin/catalog/catalog-delete-dialog", { CatalogDeleteDialog: DeleteDialog }],
  ]);
  const { CatalogManagement } = loadProjectModule(
    "components/admin/catalog/catalog-management.tsx",
    overrides,
  );
  const category = {
    kind: "categoria",
    id: FAMILY_ID,
    code: "CAT-01",
    name: "Pompe",
    subtitle: null,
    iconKey: "factory",
    sortOrder: 1,
    isActive: true,
  };
  const family = {
    kind: "famiglia",
    id: FAMILY_ID,
    sourceCode: "F-01",
    name: "Valvole",
    subtitle: null,
    iconKey: "wrench",
    sortOrder: 1,
    isActive: true,
  };

  let rendered = harness.render(CatalogManagement, managementFixture("categorie", category));
  rendered.flushEffects();
  let rows = findElement(rendered.tree, (element) => element.type.name === "CatalogRows");
  rows.props.onDelete(category);
  rendered = harness.render(CatalogManagement, managementFixture("categorie", category));
  rendered.flushEffects();
  rendered = harness.render(CatalogManagement, managementFixture("famiglie", family));
  const confirmation = findElement(rendered.tree, (element) => element.type === DeleteDialog);
  assert.equal(confirmation.props.entity, "categorie");
  assert.equal(confirmation.props.currentIsActive, true);
  await confirmation.props.deleteEntity({
    entity: confirmation.props.entity,
    id: confirmation.props.entityId,
  });
  assert.deepEqual(calls, [{ entity: "categorie", id: FAMILY_ID }]);

  rendered.flushEffects();
  rendered = harness.render(CatalogManagement, managementFixture("famiglie", family));
  assert.equal(findElement(rendered.tree, (element) => element.type === DeleteDialog), null);
});

test("one pending activation blocks a second activation and stale edit", async () => {
  const harness = createHookHarness();
  const activationCalls = [];
  let resolveActivation;
  const pendingActivation = new Promise((resolve) => { resolveActivation = resolve; });
  function Link({ href, children, ...props }) {
    return React.createElement("a", { href, ...props }, children);
  }
  function EntityDialog() { return null; }
  const overrides = new Map([
    ["react", harness.react],
    ["next/link", Link],
    ["@/app/(app)/admin/catalogo/actions", {
      async saveCategoryAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async saveFamilyAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async saveComponentAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async deleteCatalogEntityAction() { return { ok: true, data: { id: FAMILY_ID } }; },
      async setCatalogEntityActiveAction(input) {
        activationCalls.push(input);
        return pendingActivation;
      },
    }],
    ["@/components/admin/catalog/catalog-entity-dialog", { CatalogEntityDialog: EntityDialog }],
    ["@/components/admin/catalog/catalog-delete-dialog", { CatalogDeleteDialog() { return null; } }],
  ]);
  const { CatalogManagement } = loadProjectModule(
    "components/admin/catalog/catalog-management.tsx",
    overrides,
  );
  const first = {
    kind: "categoria",
    id: FAMILY_ID,
    code: "CAT-01",
    name: "Pompe",
    subtitle: null,
    iconKey: "factory",
    sortOrder: 1,
    isActive: false,
  };
  const second = { ...first, id: "20000000-0000-4000-8000-000000000020", code: "CAT-02" };
  const props = {
    ...managementFixture("categorie", first),
    result: { page: 1, pageSize: 20, total: 2, items: [first, second] },
  };

  let rendered = harness.render(CatalogManagement, props);
  rendered.flushEffects();
  let rows = findElement(rendered.tree, (element) => element.type.name === "CatalogRows");
  rows.props.onToggle(first);
  rows.props.onToggle(second);
  rows.props.onEdit(second);
  assert.deepEqual(activationCalls, [{ entity: "categorie", id: FAMILY_ID, isActive: true }]);

  rendered = harness.render(CatalogManagement, props);
  rows = findElement(rendered.tree, (element) => element.type.name === "CatalogRows");
  assert.equal(rows.props.mutationPending, true);
  const expandedRows = rows.type(rows.props);
  const markup = renderToStaticMarkup(expandedRows);
  const actionButtons = [...markup.matchAll(/<button[^>]*>[\s\S]*?<\/button>/gu)]
    .map(([button]) => button)
    .filter((button) => /(?:Modifica|Attiva|Elimina)<\/button>/u.test(button));
  assert.equal(actionButtons.length, 12);
  assert.equal(actionButtons.every((button) => /\sdisabled=""/u.test(button)), true);
  const dialog = findElement(rendered.tree, (element) => element.type === EntityDialog);
  assert.equal(dialog, null);

  resolveActivation({ ok: true, data: { id: FAMILY_ID } });
  await Promise.all(harness.transitions);
});

test("delete dialog marks its cancel target and explicitly focuses it on open", () => {
  const events = [];
  const cancelButton = { focus() { events.push("focus"); } };
  const fakeReact = {
    ...React,
    useEffect() {},
    useRef() { return { current: cancelButton }; },
    useState(initialValue) { return [initialValue, () => {}]; },
    useTransition() { return [false, () => {}]; },
  };
  function AlertDialog({ children }) { return children; }
  function AlertDialogContent({ children }) { return children; }
  const overrides = new Map([
    ["react", fakeReact],
    ["@/components/ui/alert-dialog", {
      AlertDialog,
      AlertDialogContent,
      AlertDialogHeader: ({ children }) => children,
      AlertDialogTitle: ({ children }) => children,
      AlertDialogDescription: ({ children }) => children,
      AlertDialogFooter: ({ children }) => children,
      AlertDialogCancel: ({ children }) => children,
    }],
  ]);
  const { CatalogDeleteDialog } = loadProjectModule(
    "components/admin/catalog/catalog-delete-dialog.tsx",
    overrides,
  );
  const tree = CatalogDeleteDialog({
    open: true,
    onOpenChange() {},
    entity: "categorie",
    entityId: FAMILY_ID,
    entityName: "Pompe",
    currentIsActive: true,
    mode: "delete",
    async deleteEntity() { return { ok: true, data: { id: FAMILY_ID } }; },
    async setActive() { return { ok: true, data: { id: FAMILY_ID } }; },
  });
  const content = tree.props.children;
  content.props.onOpenAutoFocus({ preventDefault() { events.push("prevent-default"); } });

  assert.deepEqual(events, ["prevent-default", "focus"]);
});

test("delete dialog cannot close through cancel while its mutation is pending", () => {
  const closes = [];
  const fakeReact = {
    ...React,
    useEffect() {},
    useRef() { return { current: null }; },
    useState(initialValue) { return [initialValue, () => {}]; },
    useTransition() { return [true, () => {}]; },
  };
  function AlertDialog({ children }) { return children; }
  function AlertDialogContent({ children }) { return children; }
  const overrides = new Map([
    ["react", fakeReact],
    ["@/components/ui/alert-dialog", {
      AlertDialog,
      AlertDialogContent,
      AlertDialogHeader: ({ children }) => children,
      AlertDialogTitle: ({ children }) => children,
      AlertDialogDescription: ({ children }) => children,
      AlertDialogFooter: ({ children }) => children,
      AlertDialogCancel: ({ children }) => children,
    }],
  ]);
  const { CatalogDeleteDialog } = loadProjectModule(
    "components/admin/catalog/catalog-delete-dialog.tsx",
    overrides,
  );
  const tree = CatalogDeleteDialog({
    open: true,
    onOpenChange(open) { closes.push(open); },
    entity: "categorie",
    entityId: FAMILY_ID,
    entityName: "Pompe",
    currentIsActive: true,
    mode: "delete",
    async deleteEntity() { return { ok: true, data: { id: FAMILY_ID } }; },
    async setActive() { return { ok: true, data: { id: FAMILY_ID } }; },
  });
  tree.props.onOpenChange(false);
  const body = tree.props.children.props.children;
  assert.equal(body.props.pending, true);
  body.props.onCancel();

  assert.deepEqual(closes, []);
});
