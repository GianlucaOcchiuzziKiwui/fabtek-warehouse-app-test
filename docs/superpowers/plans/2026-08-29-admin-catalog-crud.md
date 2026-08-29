# Admin Catalog CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one protected Admin page with four tabs and popup CRUD flows for categories, families, components, and item variants.

**Architecture:** A Next.js Server Component reads the active tab and server-side filters, while small client dialog components submit Server Actions. Session-bound Supabase access and RLS protect all reads and writes; a narrowly scoped Admin-only SQL function saves a variant and its category associations atomically.

**Tech Stack:** Next.js 16 App Router and Server Actions, React 19, TypeScript, Supabase/PostgreSQL/RLS, shadcn-style Radix UI, Tailwind CSS 4, Node test runner, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-29-admin-catalog-crud-design.md`

## Global Constraints

- Work directly on `main`; preserve unrelated working-tree changes and push exactly once after the complete final gate.
- Read the relevant installed Next.js 16 documentation in `node_modules/next/dist/docs/` before writing route, cache, form, or Server Action code.
- The route is `/admin/catalogo`; every page load and every mutation requires `catalog:manage` server-side.
- Keep the item-derived taxonomy: never create or read `category_families`.
- Use only the session Supabase client under RLS; never expose or use service role in browser code.
- Keep mutation inputs typed as `unknown` until domain validation succeeds.
- Store only `CATALOG_ICON_KEYS`; never accept raw SVG or arbitrary icon names.
- Variant and category-association writes must be atomic.
- Physical delete returns a referenced result on PostgreSQL `23503`; the UI then offers deactivation.
- Do not cascade activation/deactivation to descendants.
- Do not add suppliers, assets, inventory quantities, imports, or user management.
- Do not apply or push migrations to linked/remote Supabase, deploy, import data, or send external messages.
- Follow TDD and commit each reviewed task atomically.

## Planned File Structure

- `lib/domain/admin-catalog/contracts.ts`: entity names, list filters, view/input/result types.
- `lib/domain/admin-catalog/validation.ts`: strict parsing and normalization for all four form payloads.
- `lib/data/admin-catalog.ts`: server-only list/options queries and RLS-backed mutations.
- `supabase/migrations/20260829100000_add_admin_catalog_variant_rpc.sql`: variant ordering and atomic save RPC.
- `app/(app)/admin/catalogo/page.tsx`: permission guard, URL parsing, active-tab data loading.
- `app/(app)/admin/catalogo/loading.tsx`: route loading skeleton.
- `app/(app)/admin/catalogo/actions.ts`: permission-checked Server Actions and revalidation.
- `components/admin/catalog/catalog-management.tsx`: active-tab table shell and dialog orchestration.
- `components/admin/catalog/catalog-entity-dialog.tsx`: category/family/component forms.
- `components/admin/catalog/catalog-variant-dialog.tsx`: complete variant form.
- `components/admin/catalog/catalog-delete-dialog.tsx`: delete confirmation and referenced fallback.
- `components/admin/catalog/catalog-icon-select.tsx`: whitelisted icon select with preview.
- `components/catalog/catalog-icon.tsx`: shared Lucide registry for public and Admin UI.
- `components/ui/dialog.tsx`, `components/ui/alert-dialog.tsx`, `components/ui/select.tsx`, `components/ui/badge.tsx`: minimal project-consistent shadcn primitives if absent.
- Tests under `tests/admin-catalog-*.test.mjs` plus pgTAP coverage in `supabase/tests/admin_catalog_crud_test.sql`.

---

### Task 1: Domain contracts and strict validation

**Files:**
- Create: `lib/domain/admin-catalog/contracts.ts`
- Create: `lib/domain/admin-catalog/validation.ts`
- Create: `tests/admin-catalog-validation.test.mjs`

**Interfaces:**
- Produces: `AdminCatalogTab`, `AdminCatalogStatusFilter`, `AdminCatalogListQuery`, `CategoryInput`, `FamilyInput`, `ComponentInput`, `VariantInput`, `CatalogMutationResult`.
- Produces: `parseAdminCatalogListQuery(value: unknown)`, `parseCategoryInput(value: unknown)`, `parseFamilyInput(value: unknown)`, `parseComponentInput(value: unknown)`, `parseVariantInput(value: unknown)`.

- [ ] **Step 1: Write failing validation tests**

Cover trimmed strings, empty optional values becoming `null`, UUID validation, integer `sortOrder`, boolean flags, icon whitelist, at least one unique category ID, and invalid tab/status/page fallback. Include this representative expectation:

```js
assert.deepEqual(parseVariantInput({
  id: null,
  componentId: COMPONENT_ID,
  fabtekCode: " FT-001 ",
  oracleSapioCode: " ",
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
```

- [ ] **Step 2: Verify RED**

Run: `node --no-warnings --test tests/admin-catalog-validation.test.mjs`

Expected: fail because the domain modules do not exist.

- [ ] **Step 3: Implement minimal contracts and parsers**

Use a stable `AdminCatalogValidationError` with public code `INVALID_ADMIN_CATALOG_INPUT`. Enforce database-compatible maxima: category/family name 160, component name 200, nonempty variant description/material/connection, `sortOrder` between `-1_000_000` and `1_000_000`, and `CATALOG_ICON_KEYS` from the existing catalog contract.

- [ ] **Step 4: Verify GREEN and typecheck**

Run:

```powershell
node --no-warnings --test tests/admin-catalog-validation.test.mjs
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add -- lib/domain/admin-catalog tests/admin-catalog-validation.test.mjs
git commit -m "feat: validate admin catalog mutations"
```

---

### Task 2: Atomic variant persistence and ordering migration

**Files:**
- Create: `supabase/migrations/20260829100000_add_admin_catalog_variant_rpc.sql`
- Create: `supabase/tests/admin_catalog_crud_test.sql`
- Create: `tests/admin-catalog-sql-contract.test.mjs`

**Interfaces:**
- Produces SQL function `public.save_catalog_variant(p_id uuid, p_component_id uuid, p_fabtek_code text, p_oracle_sapio_code text, p_description text, p_diameter text, p_material text, p_connection text, p_unit_of_measure_id uuid, p_category_ids uuid[], p_track_inventory boolean, p_sort_order integer, p_is_active boolean) returns uuid`.
- Adds `item_variants.sort_order integer not null default 0` and deterministic supporting index `(component_id, sort_order, fabtek_code)`.

- [ ] **Step 1: Write RED source-contract and pgTAP tests**

The source-contract test must assert: no `category_families`, internal `has_role('admin')`, duplicate/empty category rejection, one insert/update plus replacement of `item_variant_categories`, explicit revoke from `PUBLIC`/`anon`, authenticated grant, and `sort_order` migration.

The pgTAP test creates an Admin and User transaction fixture and proves:

- Admin create returns an ID and creates exactly the selected category rows;
- Admin update replaces categories and preserves `technical_attributes`;
- duplicate or empty categories fail;
- a normal User receives `42501` and no partial variant exists;
- invalid component/unit/category rolls back the whole function.

- [ ] **Step 2: Verify RED without mutating remote state**

Run: `node --no-warnings --test tests/admin-catalog-sql-contract.test.mjs`

If local Docker is available, also run `npx supabase test db supabase/tests/admin_catalog_crud_test.sql`; otherwise record the environmental block and continue with the source-contract RED.

- [ ] **Step 3: Implement the forward-only migration**

Use `security definer set search_path = ''`, `auth.uid()`, `public.is_active_user()` and `public.has_role('admin')`. Lock the edited variant row on update, normalize optional strings with `nullif(btrim(...), '')`, insert/update the variant, delete its prior category associations, insert `unnest(p_category_ids)`, and return the ID inside the single function transaction.

- [ ] **Step 4: Verify migration contract**

Run:

```powershell
node --no-warnings --test tests/admin-catalog-sql-contract.test.mjs
npx tsc --noEmit
```

When Docker is available, run local-only:

```powershell
npx supabase migration up --local
npx supabase test db supabase/tests/admin_catalog_crud_test.sql
npx supabase test db
```

Never add `--linked` or run `db push`.

- [ ] **Step 5: Commit**

```powershell
git add -- supabase/migrations/20260829100000_add_admin_catalog_variant_rpc.sql supabase/tests/admin_catalog_crud_test.sql tests/admin-catalog-sql-contract.test.mjs
git commit -m "feat: save catalog variants atomically"
```

---

### Task 3: Admin catalog data access and mutation error mapping

**Files:**
- Create: `lib/data/admin-catalog.ts`
- Create: `tests/admin-catalog-data.test.mjs`
- Modify: `lib/data/catalog.ts`

**Interfaces:**
- Consumes: Task 1 inputs and Task 2 `save_catalog_variant`.
- Produces: `getAdminCatalogPage(query: AdminCatalogListQuery): Promise<AdminCatalogPage>`.
- Produces: `getAdminCatalogFormOptions(tab: AdminCatalogTab): Promise<AdminCatalogFormOptions>`.
- Produces: `saveCategory`, `saveFamily`, `saveComponent`, `saveVariant`, `setCatalogEntityActive`, `deleteCatalogEntity`, each returning `ActionResult<CatalogMutationResult>`.

- [ ] **Step 1: Write RED mapper/repository tests**

Use injected session clients to cover:

- per-tab select contains only required fields;
- search is escaped and uses bounded `ilike` filters;
- status filters map to `is_active`;
- count/range produce page metadata and clamp invalid pages;
- variants embed component/family, unit and categories without N+1;
- options load categories, families, components and units only when required;
- `23505` maps to `CATALOG_ENTITY_DUPLICATE`;
- `23503` delete maps to `CATALOG_ENTITY_REFERENCED`;
- no row maps to `CATALOG_ENTITY_NOT_FOUND`;
- unknown infrastructure errors return a generic stable error.

- [ ] **Step 2: Verify RED**

Run: `node --no-warnings --test tests/admin-catalog-data.test.mjs`

Expected: missing module/functions.

- [ ] **Step 3: Implement server-only DAL**

Use `createClient()` from `lib/supabase/server.ts`, no admin client. Keep a dependency-injection seam for tests. Update public `item_variants` ordering to `sort_order`, then `fabtek_code` after the migration contract exists.

`deleteCatalogEntity` must map the tab to a fixed table name; never accept a table string from the browser. Toggle updates only `is_active` and `updated_at`.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
node --no-warnings --test tests/admin-catalog-data.test.mjs tests/catalog-data-contract.test.mjs tests/catalog-mappers.test.mjs
npx tsc --noEmit
npx eslint lib/data/admin-catalog.ts lib/data/catalog.ts tests/admin-catalog-data.test.mjs
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add -- lib/data/admin-catalog.ts lib/data/catalog.ts tests/admin-catalog-data.test.mjs
git commit -m "feat: add admin catalog repository"
```

---

### Task 4: Shared icon registry and shadcn dialog primitives

**Files:**
- Create: `components/catalog/catalog-icon.tsx`
- Modify: `components/catalog/catalog-navigation.tsx`
- Create if absent: `components/ui/dialog.tsx`
- Create if absent: `components/ui/alert-dialog.tsx`
- Create if absent: `components/ui/select.tsx`
- Create if absent: `components/ui/badge.tsx`
- Create: `components/admin/catalog/catalog-icon-select.tsx`
- Create: `tests/admin-catalog-ui-contract.test.mjs`

**Interfaces:**
- Produces: `CATALOG_ICON_LABELS`, `getCatalogIcon(iconKey)`, `CatalogIcon` and `CatalogIconSelect`.
- Produces shadcn-compatible dialog/select primitives used by Tasks 6–7.

- [ ] **Step 1: Write RED UI contract tests**

Assert the shared registry has exactly every `CATALOG_ICON_KEYS` entry, public navigation imports the shared component instead of a second registry, the select renders the current icon and readable Italian label, and dialog primitives expose title/description/close semantics.

- [ ] **Step 2: Verify RED**

Run: `node --no-warnings --test tests/admin-catalog-ui-contract.test.mjs`

- [ ] **Step 3: Implement minimal shared UI**

Use exports from the installed `radix-ui` package and the existing `cn` utility. Do not add dependencies. Keep the icon button at least 40 px and expose the icon name as text, not color alone.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
node --no-warnings --test tests/admin-catalog-ui-contract.test.mjs tests/catalog-navigation.test.mjs
npx tsc --noEmit
npx eslint components/catalog components/admin/catalog/catalog-icon-select.tsx components/ui/dialog.tsx components/ui/alert-dialog.tsx components/ui/select.tsx components/ui/badge.tsx
```

- [ ] **Step 5: Commit**

```powershell
git add -- components/catalog components/admin/catalog/catalog-icon-select.tsx components/ui tests/admin-catalog-ui-contract.test.mjs
git commit -m "feat: add catalog dialog primitives"
```

---

### Task 5: Protected page shell, tabs, filters, and navigation

**Files:**
- Create: `app/(app)/admin/catalogo/page.tsx`
- Create: `app/(app)/admin/catalogo/loading.tsx`
- Create: `components/admin/catalog/catalog-management.tsx`
- Modify: `components/layout/app-navigation.tsx`
- Create: `tests/admin-catalog-page.test.mjs`

**Interfaces:**
- Consumes: `parseAdminCatalogListQuery`, `getAdminCatalogPage`, `getAdminCatalogFormOptions`.
- Produces the protected `/admin/catalogo` page and stable URL filters.

- [ ] **Step 1: Write RED route and accessibility tests**

Assert the page calls `requirePermission("catalog:manage")` before data access, recognizes only the four tabs, keeps `tab`, `q`, `status`, `page` in links, renders `Nuovo`, status badges and an empty state, and adds `Gestisci catalogo` only inside the Admin navigation branch.

- [ ] **Step 2: Verify RED**

Run: `node --no-warnings --test tests/admin-catalog-page.test.mjs`

- [ ] **Step 3: Implement the page shell**

Use async `searchParams` according to the installed Next.js 16 docs. Load only the active tab. Use normal links/forms for filters so browser navigation works without a client cache. Render table markup at desktop and card rows below `md` without duplicating business state.

- [ ] **Step 4: Verify GREEN and build**

Run:

```powershell
node --no-warnings --test tests/admin-catalog-page.test.mjs tests/touch-targets.test.mjs
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Commit**

```powershell
git add -- 'app/(app)/admin/catalogo' components/admin/catalog/catalog-management.tsx components/layout/app-navigation.tsx tests/admin-catalog-page.test.mjs
git commit -m "feat: add admin catalog page"
```

---

### Task 6: Server Actions and CRUD dialogs for categories, families, and components

**Files:**
- Create: `app/(app)/admin/catalogo/actions.ts`
- Create: `components/admin/catalog/catalog-entity-dialog.tsx`
- Create: `components/admin/catalog/catalog-delete-dialog.tsx`
- Modify: `components/admin/catalog/catalog-management.tsx`
- Create: `tests/admin-catalog-actions.test.mjs`
- Extend: `tests/admin-catalog-ui-contract.test.mjs`

**Interfaces:**
- Produces: `saveCategoryAction`, `saveFamilyAction`, `saveComponentAction`, `setCatalogEntityActiveAction`, `deleteCatalogEntityAction`.
- Each action consumes `unknown`, calls `requirePermission("catalog:manage")`, returns `ActionResult<CatalogMutationResult>`, and revalidates `/admin/catalogo` plus `/catalogo` only on success.

- [ ] **Step 1: Write RED action tests**

Inject action dependencies and assert permission runs before parsing/repository work, invalid inputs do not call Supabase, success triggers both revalidations, and expected errors remain stable. Assert no action accepts a raw table name.

- [ ] **Step 2: Write RED dialog contract tests**

Cover create/edit titles, labels, icon select on every entity, family select for components, numeric order, active toggle, disabled submit while pending, focusable cancel, field error announcement, success toast, and delete-reference response changing the primary fallback action to `Disattiva`.

- [ ] **Step 3: Implement actions and simple dialogs**

Use `useActionState` or a project-consistent transition according to Next.js 16 docs. Keep dialogs controlled by the management component, reset state when entity changes, close only on success, and leave user-entered values visible on validation/infrastructure errors.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
node --no-warnings --test tests/admin-catalog-actions.test.mjs tests/admin-catalog-ui-contract.test.mjs
npx tsc --noEmit
npx eslint 'app/(app)/admin/catalogo/actions.ts' components/admin/catalog tests/admin-catalog-actions.test.mjs
```

- [ ] **Step 5: Commit**

```powershell
git add -- 'app/(app)/admin/catalogo/actions.ts' components/admin/catalog tests/admin-catalog-actions.test.mjs tests/admin-catalog-ui-contract.test.mjs
git commit -m "feat: manage catalog groups in dialogs"
```

---

### Task 7: Complete variant dialog and atomic category management

**Files:**
- Create: `components/admin/catalog/catalog-variant-dialog.tsx`
- Modify: `components/admin/catalog/catalog-management.tsx`
- Modify: `app/(app)/admin/catalogo/actions.ts`
- Extend: `tests/admin-catalog-actions.test.mjs`
- Extend: `tests/admin-catalog-ui-contract.test.mjs`

**Interfaces:**
- Produces: `saveVariantAction(input: unknown): Promise<ActionResult<CatalogMutationResult>>`.
- Consumes the Task 2 RPC through `saveVariant` and every Task 1 `VariantInput` field.

- [ ] **Step 1: Write RED variant action tests**

Assert full normalized payload forwarding, at least one category, unique categories, permission before repository access, stable duplicate/relation errors, and revalidation only on success.

- [ ] **Step 2: Write RED variant form tests**

Assert labels and controls for component, Fabtek, Oracle/SAPIO, description, diameter, material, connection, unit, category multi-select, inventory tracking, order and active state. The category selector must be keyboard reachable and visibly list selected categories.

- [ ] **Step 3: Implement the minimal variant dialog**

Use searchable native inputs/select primitives already created; a compact checkbox list inside a bordered fieldset is preferred over adding a multi-select dependency. Keep all selected category IDs explicit in submitted data.

- [ ] **Step 4: Verify GREEN and regress public catalog**

Run:

```powershell
node --no-warnings --test tests/admin-catalog-actions.test.mjs tests/admin-catalog-ui-contract.test.mjs tests/catalog-data-contract.test.mjs tests/catalog-navigation.test.mjs
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Commit**

```powershell
git add -- components/admin/catalog/catalog-variant-dialog.tsx components/admin/catalog/catalog-management.tsx 'app/(app)/admin/catalogo/actions.ts' tests/admin-catalog-actions.test.mjs tests/admin-catalog-ui-contract.test.mjs
git commit -m "feat: manage catalog variants in dialogs"
```

---

### Task 8: Integrated verification and responsive browser QA

**Files:**
- Modify only if verification exposes a task-scoped defect.
- Create ignored evidence under `.superpowers/sdd/2026-08-29-admin-catalog-crud/`.

**Interfaces:**
- Consumes all prior tasks.
- Produces evidence for authorization, CRUD behavior, public-catalog consistency, and responsive dialog usability.

- [ ] **Step 1: Review committed scope and dependency state**

Run:

```powershell
git status --short
git diff --check
git log --oneline -12
npm ls radix-ui next react @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 2: Run the complete automated gate**

Run:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Run local-only database verification when available**

First run read-only `docker version` and `npx supabase status`. Only when the daemon and local project are available:

```powershell
npx supabase migration up --local
npx supabase test db
```

Do not reset, link, push, or modify remote Supabase.

- [ ] **Step 4: Browser verification with a local Admin session**

Verify desktop and mobile widths:

- four tab URLs and browser back/forward;
- search/status filters and pagination;
- create/edit one disposable record of each type;
- icon select preview for category/family/component;
- variant category replacement and public derived path;
- failed delete of a referenced entity offers deactivation;
- successful delete of an unreferenced disposable entity;
- User session receives no navigation link and server denial;
- dialog focus trap, Escape/Cancel, labels, errors and touch targets;
- no horizontal overflow or console/server errors.

Use only local disposable fixtures and remove them through the UI. If no local Admin session/database is available, do not mutate remote state and state the missing verification explicitly.

- [ ] **Step 5: Final review and one push**

Generate the complete review package from the pre-feature base, dispatch an independent final reviewer, address Critical/Important findings, rerun the clean verification gate, confirm the configured upstream, and perform exactly one `git push` after approval. Preserve unrelated working-tree files.
