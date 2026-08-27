# Item-Derived Catalog Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the persisted category-family contract and derive every category → family → component navigation path from active item variants and their category associations.

**Architecture:** `item_variants` remains the base catalog entity. `item_variants.component_id`, `components.family_id`, and `item_variant_categories` are the only authoritative relations; the server DAL derives and deduplicates navigation options without adding views, RPCs, or public HTTP APIs.

**Tech Stack:** PostgreSQL 17/Supabase migrations and pgTAP, Next.js 16 App Router, TypeScript, Supabase JS/PostgREST, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-27-item-derived-catalog-taxonomy-design.md`

## Global Constraints

- `item_variants` is the single requestable item entity; do not add a separate `items` table.
- Keep only `item_variants → component`, `component → family`, and `item_variants ↔ categories` as persisted taxonomy relations.
- Show every active category at the first navigation step, including categories without active items.
- Derive families and components only from active items, active components, active families, and the selected active category.
- Do not introduce SQL views, new RPCs, Route Handlers, public HTTP APIs, or privileged browser clients.
- Preserve existing RLS boundaries and direct item-category validation in `submit_material_request`.
- Apply and verify migrations only against local Supabase. Never run `supabase db reset` against a linked remote, `supabase db push`, deploy, or Git push.
- Do not import catalog data.

## File Structure

- Create `supabase/migrations/20260827180000_remove_category_families.sql`: forward-only removal of the obsolete table, triggers, and trigger functions.
- Modify `supabase/tests/stock_tracking_test.sql`: keep the request/stock fixture valid without `category_families` and assert the old schema contract is absent.
- Modify `lib/data/catalog-mappers.ts`: map and deterministically deduplicate family/component options reached through item rows.
- Modify `lib/data/catalog.ts`: replace all `category_families` reads with item-derived relational queries for filters and taxonomy search.
- Modify `tests/catalog-navigation.test.mjs`: cover derived option mapping, duplicates, inactive/malformed rows, and multi-category paths.
- Create `tests/catalog-data-contract.test.mjs`: prevent the DAL from reintroducing `category_families` and assert item-level relation paths remain present.
- Modify `products.md`: remove `CategoryFamily` and document derived category-family/component projections.
- Modify `ARCHITECTURE.md`: update the catalog data model and navigation query contract.

---

### Task 1: Remove the persisted category-family relation

**Files:**
- Create: `supabase/migrations/20260827180000_remove_category_families.sql`
- Modify: `supabase/tests/stock_tracking_test.sql`

**Interfaces:**
- Consumes: existing tables `categories`, `families`, `components`, `item_variants`, `item_variant_categories`.
- Produces: a schema where `to_regclass('public.category_families') is null` and item-category writes no longer consult category-family compatibility triggers.

- [ ] **Step 1: Write the failing pgTAP assertions and remove the obsolete fixture insert**

Change `select plan(29);` to `select plan(33);`, remove the `insert into public.category_families`, and add these assertions after the family fixture:

```sql
select hasnt_table(
  'public',
  'category_families',
  'category-family compatibility is not persisted'
);

select hasnt_function(
  'public',
  'validate_item_variant_category',
  'item-category writes do not depend on a category-family table'
);

select hasnt_function(
  'public',
  'validate_component_family_change',
  'component family changes are independent from item categories'
);

select hasnt_function(
  'public',
  'validate_variant_component_change',
  'variant component changes preserve categories without compatibility lookup'
);
```

- [ ] **Step 2: Run the SQL test and verify the old contract fails**

Run: `npx supabase test db supabase/tests/stock_tracking_test.sql`

Expected: FAIL because `public.category_families` and its compatibility functions still exist.

- [ ] **Step 3: Create the forward migration**

Create `supabase/migrations/20260827180000_remove_category_families.sql` with explicit dependency order:

```sql
drop trigger if exists validate_item_variant_category_before_write
on public.item_variant_categories;

drop trigger if exists validate_component_family_before_update
on public.components;

drop trigger if exists validate_variant_component_before_update
on public.item_variants;

drop trigger if exists protect_category_family_before_change
on public.category_families;

drop function if exists public.validate_item_variant_category();
drop function if exists public.validate_component_family_change();
drop function if exists public.validate_variant_component_change();
drop function if exists public.protect_category_family_compatibility();

drop table public.category_families;
```

- [ ] **Step 4: Apply only pending migrations to local Supabase**

Run: `npx supabase migration up --local`

Expected: `20260827180000_remove_category_families.sql` applies successfully. Do not use `db reset` and do not add `--linked`.

- [ ] **Step 5: Run the focused and complete database tests**

Run:

```powershell
npx supabase test db supabase/tests/stock_tracking_test.sql
npx supabase test db
```

Expected: all pgTAP assertions pass; request submission still accepts the fixture's direct item-category associations.

- [ ] **Step 6: Verify local migration state and absence of the old relation**

Run:

```powershell
npx supabase migration list --local
```

Expected: `20260827180000` appears in the local column. Query local PostgreSQL read-only and confirm `to_regclass('public.category_families')` is null.

- [ ] **Step 7: Commit the schema deliverable**

```powershell
git add -- 'supabase/migrations/20260827180000_remove_category_families.sql' 'supabase/tests/stock_tracking_test.sql'
git commit -m "refactor: remove category family relation"
```

---

### Task 2: Map taxonomy options reached through items

**Files:**
- Modify: `lib/data/catalog-mappers.ts`
- Modify: `tests/catalog-navigation.test.mjs`

**Interfaces:**
- Consumes: unknown PostgREST rows shaped as `{ item_variant: { component: { id, name, icon_key, sort_order, is_active, family } } }`.
- Produces: `mapDerivedCatalogOptions(rows: unknown, kind: "family" | "component"): CatalogOption[]`.

- [ ] **Step 1: Add failing mapper tests**

Add a test using two items from the same component and a third item from another component:

```js
test("derives unique ordered families and components from item rows", () => {
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
          family: { id: "family-b", name: "Tubazioni", icon_key: "boxes", sort_order: 20, is_active: true },
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
          family: { id: "family-a", name: "Valvole", icon_key: "wrench", sort_order: 10, is_active: true },
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
          family: { id: "family-a", name: "Valvole", icon_key: "wrench", sort_order: 10, is_active: true },
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
```

Add a second test proving malformed, inactive item/component/family rows are ignored.
Add a third test passing the same family/component path with two different categories to `mapCatalogNavigationMatches`; assert that both category paths remain while duplicate item rows inside either path are removed.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --experimental-strip-types tests/catalog-navigation.test.mjs`

Expected: FAIL because `mapDerivedCatalogOptions` is not exported.

- [ ] **Step 3: Implement the minimal mapper**

In `catalog-mappers.ts`, add a helper that unwraps one-to-one PostgREST records or one-element arrays, validates `is_active !== false`, chooses `component.family` for `family` and `component` for `component`, maps the icon with the existing allowlist, deduplicates by ID, and sorts by numeric `sort_order` then `name` using Italian-insensitive `localeCompare`:

```ts
export function mapDerivedCatalogOptions(
  rows: unknown,
  kind: "family" | "component",
): CatalogOption[] {
  if (!Array.isArray(rows)) return [];

  const fallbackIcon = kind === "family" ? "boxes" : "component";
  const entries = new Map<string, { option: CatalogOption; sortOrder: number }>();

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const variant = firstRecord(row.item_variant);
    const component = firstRecord(variant?.component);
    const family = firstRecord(component?.family);
    if (
      variant?.is_active !== true
      || component?.is_active !== true
      || family?.is_active !== true
    ) continue;

    const record = kind === "family" ? family : component;
    const option = mapOption(record, fallbackIcon);
    if (!option) continue;
    entries.set(option.id, {
      option,
      sortOrder: nullableInteger(record.sort_order) ?? 0,
    });
  }

  return [...entries.values()]
    .sort((left, right) => (
      left.sortOrder - right.sortOrder
      || left.option.name.localeCompare(right.option.name, "it", { sensitivity: "base" })
    ))
    .map(({ option }) => option);
}
```

Use fallback icon `boxes` for families and `component` for components. Do not change `CatalogOption` or expose `sort_order` to UI components.

- [ ] **Step 4: Run focused mapper tests**

Run: `node --test --experimental-strip-types tests/catalog-navigation.test.mjs`

Expected: PASS, including duplicate and inactive-row cases.

- [ ] **Step 5: Commit the mapper deliverable**

```powershell
git add -- 'lib/data/catalog-mappers.ts' 'tests/catalog-navigation.test.mjs'
git commit -m "feat: derive catalog groups from items"
```

---

### Task 3: Derive filter options and search paths in the catalog DAL

**Files:**
- Modify: `lib/data/catalog.ts`
- Create: `tests/catalog-data-contract.test.mjs`

**Interfaces:**
- Consumes: `mapDerivedCatalogOptions(rows, "family" | "component")` from Task 2.
- Produces: unchanged public functions `getCatalogFilters(filters): Promise<CatalogFilterOptions>` and `searchCatalogNavigation(query): Promise<CatalogNavigationMatch[]>` with item-derived behavior.

- [ ] **Step 1: Add a failing source-contract test**

Create `tests/catalog-data-contract.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("catalog navigation derives taxonomy from item category associations", async () => {
  const source = await readFile("lib/data/catalog.ts", "utf8");

  assert.doesNotMatch(source, /from\(["']category_families["']\)/u);
  assert.match(source, /from\(["']item_variant_categories["']\)/u);
  assert.match(source, /item_variant:item_variants!inner/u);
  assert.match(source, /component:components!inner/u);
  assert.match(source, /family:families!inner/u);
});
```

- [ ] **Step 2: Run the source-contract test and verify RED**

Run: `node --test tests/catalog-data-contract.test.mjs`

Expected: FAIL because `catalog.ts` still reads `category_families`.

- [ ] **Step 3: Replace family and component filter queries**

Import `mapDerivedCatalogOptions`. Define one select string for category associations:

```ts
const DERIVED_TAXONOMY_SELECT = `
  item_variant:item_variants!inner(
    is_active,
    component:components!inner(
      id,
      name,
      icon_key,
      sort_order,
      is_active,
      family:families!inner(id, name, icon_key, sort_order, is_active)
    )
  )
`;
```

For an active selected category, query `item_variant_categories`, filter `category_id`, `item_variant.is_active`, `item_variant.component.is_active`, and `item_variant.component.family.is_active`. Map families with `mapDerivedCatalogOptions(rows, "family")`.

For a selected category and canonical family, use the same relation query plus `item_variant.component.family_id = normalized.familyId`. Map components with `mapDerivedCatalogOptions(rows, "component")`. This guarantees components have at least one active item in the selected category.

Keep the categories query unchanged so every active category remains visible.

- [ ] **Step 4: Replace taxonomy search paths**

Keep the direct active-category name search. Replace both `category_families` reads with:

- a family-name query rooted at `families`, embedding active `components → item_variants → item_variant_categories → categories`;
- a component-name query rooted at `components`, embedding its active family and active `item_variants → item_variant_categories → categories`.

Flatten each matching family/component into one raw match per reachable active category, then pass the rows to `mapCatalogNavigationMatches`. A family or component with multiple items in the same category must still produce one result because the mapper deduplicates by the full path key.

Use `NAVIGATION_SEARCH_LIMIT` on matching root families/components, not on item rows, so a component with many items cannot hide other matches.

Use these relation shapes so all category paths come from item associations:

```ts
const FAMILY_SEARCH_SELECT = `
  id,
  name,
  icon_key,
  is_active,
  components:components!inner(
    is_active,
    items:item_variants!inner(
      is_active,
      categories:item_variant_categories!inner(
        category:categories!inner(id, name, icon_key, is_active)
      )
    )
  )
`;

const COMPONENT_SEARCH_SELECT = `
  id,
  name,
  icon_key,
  is_active,
  family:families!inner(id, name, icon_key, is_active),
  items:item_variants!inner(
    is_active,
    categories:item_variant_categories!inner(
      category:categories!inner(id, name, icon_key, is_active)
    )
  )
`;

function collectItemCategories(items: unknown): unknown[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => (
    isRecord(item) && Array.isArray(item.categories)
      ? item.categories.flatMap((relation) => (
          isRecord(relation) ? [relation.category] : []
        ))
      : []
  ));
}

function collectFamilyCategories(components: unknown): unknown[] {
  if (!Array.isArray(components)) return [];
  return components.flatMap((component) => (
    isRecord(component) ? collectItemCategories(component.items) : []
  ));
}
```

For every family row, emit `{ kind: "family", category, family }` for `collectFamilyCategories(family.components)`. For every component row, emit `{ kind: "component", category, family: component.family, component }` for `collectItemCategories(component.items)`. Filter every embedded `is_active` relation in the Supabase query before flattening.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
node --test --experimental-strip-types tests/catalog-navigation.test.mjs tests/catalog-data-contract.test.mjs
npx tsc --noEmit
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Verify no runtime code reads the obsolete relation**

Run:

```powershell
rg -n "category_families|CategoryFamily" lib components app supabase/tests --glob '*.ts' --glob '*.tsx' --glob '*.sql'
```

Expected: no runtime result; historical migration references are intentionally excluded, and the migration removal file may contain the name.

- [ ] **Step 7: Commit the DAL deliverable**

```powershell
git add -- 'lib/data/catalog.ts' 'tests/catalog-data-contract.test.mjs'
git commit -m "fix: derive catalog navigation from items"
```

---

### Task 4: Update the canonical project contract

**Files:**
- Modify: `products.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Consumes: the schema and DAL behavior completed in Tasks 1–3.
- Produces: canonical documentation that contains no active `CategoryFamily` contract.

- [ ] **Step 1: Update `products.md`**

Replace statements that require an explicit category-family relation with this contract:

```markdown
L'item (`item_variants`) è l'unità base del catalogo. Ogni item appartiene a un componente, ogni componente appartiene a una famiglia e ogni item può essere associato a N categorie tramite `item_variant_categories`. Non esiste una relazione diretta tra categoria e famiglia o tra categoria e componente: entrambe sono proiezioni dedotte dagli item attivi.
```

Remove the `CategoryFamily` entity section and remove the item-category compatibility constraint against it. Preserve the rule that request submission validates the selected category directly against the item.

- [ ] **Step 2: Update `ARCHITECTURE.md`**

Document that catalog filter queries derive families and components through `item_variant_categories → item_variants → components → families`, while categories remain independently listed. Remove `category_families` from the schema inventory if present.

- [ ] **Step 3: Verify the canonical docs have no contradictory active contract**

Run:

```powershell
rg -n "CategoryFamily|category_families|associazione tra categoria e famiglia" products.md ARCHITECTURE.md
```

Expected: no result except an explicitly historical/removal note, which should be removed if it can be stated directly without the obsolete name.

- [ ] **Step 4: Commit documentation**

```powershell
git add -- 'products.md' 'ARCHITECTURE.md'
git commit -m "docs: align catalog contract with items"
```

---

### Task 5: Verify the complete local behavior

**Files:**
- Test: `tests/catalog-navigation.test.mjs`
- Test: `tests/catalog-data-contract.test.mjs`
- Test: `supabase/tests/stock_tracking_test.sql`
- Verify: `/catalogo`
- Verify: `/richieste/nuova/materiali`

**Interfaces:**
- Consumes: all deliverables from Tasks 1–4.
- Produces: evidence that schema, RLS-backed reads, search, and both catalog flows share the item-derived contract.

- [ ] **Step 1: Run all automated verification**

Run sequentially where Next or Supabase share build/database state:

```powershell
npm test
npx supabase test db
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 2: Start the built application against local Supabase**

Run `npm start` on an unused local port. Use the existing authenticated local browser session; do not create remote users or modify remote data.

- [ ] **Step 3: Verify catalog navigation**

In `/catalogo`, confirm:

- the first step contains every active category;
- selecting a populated category shows only families reached by its items;
- selecting a family shows only components reached by items in that category;
- selecting a component shows only compatible items;
- a category without items shows the family-level empty state rather than disappearing.

- [ ] **Step 4: Verify search and request selection reuse the same paths**

Search for one known family and one known component. Confirm every result includes a category path derived from an item. Repeat the same category → family → component path in `/richieste/nuova/materiali` after completing only the local request header draft.

- [ ] **Step 5: Inspect browser and server errors, then clean test-only local state**

Confirm there are no console/server errors caused by the changed queries. Clear temporary request header values through the UI. Do not delete catalog or request records outside transaction-scoped pgTAP fixtures.

- [ ] **Step 6: Review final scope and commit any verification-only test adjustment**

Run:

```powershell
git status --short
git diff --check
git log --oneline -6
```

Expected: no unrelated changes and no uncommitted implementation files. If a test-only correction was necessary, commit only those exact files with `test: cover item-derived catalog paths`.

Do not push the branch.
