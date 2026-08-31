# On-demand Request PDFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace persisted official request PDFs with authenticated PDF generation on every download from the request detail.

**Architecture:** A Node.js Route Handler receives `requestId` and the official document kind, loads immutable request snapshots through the caller's Supabase session and RLS, maps them through the existing PDF contracts, renders a `Buffer`, and returns it without caching or Storage. The detail page derives its two actions from request status, while the obsolete worker, Storage download, email pipeline, and scheduler entry point are removed.

**Tech Stack:** Next.js 16.3 App Router and Route Handlers, React 19, Supabase SSR/RLS, `@react-pdf/renderer`, Node test runner, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-31-on-demand-request-pdfs-design.md`

## Global Constraints

- Official PDF bytes must never be persisted in database, filesystem, application cache, or Supabase Storage.
- `initial_request` is available for every existing visible request; `final_report` is available only when request status is exactly `evasa`.
- Every endpoint call rechecks session, active profile, permission, identifier, document kind, RLS visibility, and final-report state server-side.
- Official PDFs use immutable request-line snapshots; the browser supplies only request ID and document kind.
- Successful and error responses use `Cache-Control: private, no-store` or stricter `no-store` semantics.
- Preserve `POST /api/documents/draft` and the shared renderer/templates.
- Do not rewrite the atomic `submit_material_request` or `fulfill_request_line` RPCs; legacy metadata rows may remain pending.
- Do not apply migrations, deploy, push, reset a database, or delete remote data during implementation.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` completely before editing Route Handlers.
- Preserve the unrelated local materials-page Suspense fix and its test; they are outside this plan's task commits.

---

### Task 1: Authorized on-demand PDF source and download route

**Files:**
- Create: `app/api/requests/[requestId]/pdf/[kind]/route.ts`
- Create: `lib/domain/documents/on-demand-pdf.ts`
- Modify: `lib/data/documents.ts`
- Modify: `tests/document-routes.test.mjs`
- Test: `tests/document-routes.test.mjs`

**Interfaces:**
- Consumes: `OfficialDocumentKind`, `OfficialPdfSource`, `loadOfficialPdfSource`, `mapOfficialPdfDocument`, `renderPdfDocument`, and `getPdfFilename`.
- Produces: `createOnDemandPdf(source, kind, dependencies?) -> Promise<{ buffer: Buffer; filename: string }>`; `loadAuthorizedOfficialPdfSource(requestId, kind, dependencies?) -> Promise<OfficialPdfSource | null>`; `createRequestPdfHandler(overrides?) -> GET handler`.

- [ ] **Step 1: Add failing route tests for authorization, validation, state gating, and PDF response**

Extend the existing SWC/loader-based route tests so they exercise the real handler factory with narrow dependency overrides. Cover these literal outcomes:

```js
assert.equal((await handler(request, context)).status, 401); // no profile
assert.equal((await handler(request, context)).status, 403); // inactive profile
assert.equal((await handler(request, invalidUuidContext)).status, 404);
assert.equal((await handler(request, invalidKindContext)).status, 404);
assert.equal((await handler(request, earlyFinalContext)).status, 409);
assert.equal(response.headers.get("content-type"), "application/pdf");
assert.equal(response.headers.get("content-disposition"), 'attachment; filename="fabtek-richiesta-000042.pdf"');
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from("%PDF-on-demand"));
```

Assert that validation failures do not call the source loader, that a premature final report does not call the renderer, and that an RLS-invisible request maps to `404`.

- [ ] **Step 2: Run the focused route tests and confirm the expected failure**

Run:

```powershell
node --no-warnings --test tests/document-routes.test.mjs
```

Expected: failure because the on-demand route/handler does not exist.

- [ ] **Step 3: Add a session-scoped official-source loader**

In `lib/data/documents.ts`, reuse the existing request, line, fulfillment selects and mapping. Add a dependency type accepting the normal Supabase session client and implement:

```ts
export async function loadAuthorizedOfficialPdfSource(
  requestId: string,
  kind: OfficialDocumentKind,
  dependencies: Partial<AuthorizedDocumentDependencies> = {},
): Promise<OfficialPdfSource | null>
```

Return `null` only for a valid but absent/RLS-invisible request. Reject malformed responses and infrastructure errors with stable `DocumentDataError` codes. Load fulfillments only for `final_report`, preserve paginated reads and deterministic ordering, and never call `createAdminClient` or Storage.

- [ ] **Step 4: Add the on-demand rendering service**

Create `lib/domain/documents/on-demand-pdf.ts` as a server-only module:

```ts
export class OnDemandPdfError extends Error {
  constructor(readonly code: "FINAL_REPORT_NOT_READY" | "PDF_RENDER_FAILED") {
    super("Il PDF non è disponibile in questo momento.");
  }
}

export async function createOnDemandPdf(
  source: OfficialPdfSource,
  kind: OfficialDocumentKind,
  dependencies: { render?: typeof renderPdfDocument } = {},
) {
  if (kind === "final_report" && source.status !== "evasa") {
    throw new OnDemandPdfError("FINAL_REPORT_NOT_READY");
  }
  const document = mapOfficialPdfDocument(source, kind);
  const buffer = await (dependencies.render ?? renderPdfDocument)(document);
  return { buffer, filename: getPdfFilename(document) };
}
```

Preserve mapper errors as server failures and do not hide a state error as `500`.

- [ ] **Step 5: Implement the Node.js Route Handler factory**

Create the dynamic route with:

```ts
export const runtime = "nodejs";

export function createRequestPdfHandler(overrides = {}) {
  return async function GET(_request: Request, context: RouteContext) {
    // profile -> params validation -> RLS source -> state/render -> attachment response
  };
}

export const GET = createRequestPdfHandler();
```

Use `getCurrentProfile`, `can(profile, "requests:read-own")`, the session-scoped loader, and `createOnDemandPdf`. Return stable Italian JSON errors with `no-store`: `401` session, `403` inactive/denied, `404` invalid or invisible, `409` final report not ready, `500` unexpected failure. Log only operation and stable error code.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```powershell
node --no-warnings --test tests/document-routes.test.mjs tests/pdf-renderer.test.mjs
npx tsc --noEmit
```

Expected: all selected tests pass and TypeScript exits `0`.

- [ ] **Step 7: Commit the backend task**

```powershell
git add -- 'app/api/requests/[requestId]/pdf/[kind]/route.ts' 'lib/domain/documents/on-demand-pdf.ts' 'lib/data/documents.ts' 'tests/document-routes.test.mjs'
git commit -m "feat: generate request PDFs on demand"
```

---

### Task 2: Request-detail PDF actions independent of document records

**Files:**
- Create: `components/requests/request-pdf-download-button.tsx`
- Modify: `components/requests/request-detail.tsx`
- Modify: `lib/data/requests.ts`
- Modify: `lib/data/request-mappers.ts`
- Modify: `tests/request-mappers.test.mjs`
- Modify: `tests/document-routes.test.mjs`
- Test: `tests/request-mappers.test.mjs`
- Test: `tests/document-routes.test.mjs`

**Interfaces:**
- Consumes: Task 1 endpoint `/api/requests/${requestId}/pdf/${kind}` and `RequestDetail.status`.
- Produces: `RequestPdfDownloadButton({ requestId, kind, label })`; `RequestDetail` without a `documents` field or `RequestDocumentView` type.

- [ ] **Step 1: Add failing mapper and UI behavior tests**

Update request fixtures to omit `documents`. Assert `mapRequestDetail` succeeds without that relation and returns no `documents` property. Add a real component-render test through the existing SWC loader that checks:

```js
assert.match(preparationHtml, /Genera PDF richiesta/u);
assert.doesNotMatch(preparationHtml, /Genera report finale/u);
assert.match(preparationHtml, /Il report finale sarà disponibile/u);
assert.match(completedHtml, /Genera PDF richiesta/u);
assert.match(completedHtml, /Genera report finale/u);
```

Test the download button by injecting `fetch`, `URL.createObjectURL`, and an anchor factory at the browser boundary: one click targets the exact Task 1 endpoint, sets `aria-busy`, ignores a concurrent second click, downloads the returned blob, and renders an accessible Italian error for non-OK responses.

- [ ] **Step 2: Run the focused tests and confirm the expected failure**

Run:

```powershell
node --no-warnings --test tests/request-mappers.test.mjs tests/document-routes.test.mjs
```

Expected: failure because the detail still requires document records and the new buttons do not exist.

- [ ] **Step 3: Remove document metadata from the request-detail DTO and query**

Delete `RequestDocumentView`, `RequestDetail.documents`, `mapRequestDocument`, and document sorting. Change `REQUEST_DETAIL_SELECT` to stop selecting `generated_documents`. Keep request/line/fulfillment mapping strict and unchanged otherwise.

- [ ] **Step 4: Implement the focused client download button**

Create a client component with this public contract:

```ts
type RequestPdfDownloadButtonProps = {
  requestId: string;
  kind: "initial_request" | "final_report";
  label: "Genera PDF richiesta" | "Genera report finale";
};
```

On click, fetch the exact endpoint, require an OK PDF response, create an object URL, trigger an attachment download, revoke the URL in `finally`, and expose pending/error state. Use the existing `Button`, `LoaderCircle`/`Download` icons, and concise Italian copy. Keep the minimum 40px touch target.

- [ ] **Step 5: Replace the Document status list with on-demand actions**

In `RequestDetail`, always render the initial-request button. Render the final-report button only when `request.status.label === "Evasa"`; otherwise render: `Il report finale sarà disponibile quando la richiesta sarà completamente evasa.` Do not render disabled buttons, pending job states, timestamps, or document IDs.

- [ ] **Step 6: Run focused tests, accessibility checks, and typecheck**

Run:

```powershell
node --no-warnings --test tests/request-mappers.test.mjs tests/document-routes.test.mjs tests/request-accessibility.test.mjs tests/touch-targets.test.mjs
npx tsc --noEmit
```

Expected: all selected tests pass and TypeScript exits `0`.

- [ ] **Step 7: Commit the request-detail task**

```powershell
git add -- 'components/requests/request-pdf-download-button.tsx' 'components/requests/request-detail.tsx' 'lib/data/requests.ts' 'lib/data/request-mappers.ts' tests/request-mappers.test.mjs tests/document-routes.test.mjs
git commit -m "feat: add on-demand PDF actions"
```

---

### Task 3: Decommission persisted PDF infrastructure and remove the Storage bucket

**Files:**
- Delete: `app/api/documents/[documentId]/route.ts`
- Delete: `app/api/internal/jobs/route.ts`
- Delete: `lib/domain/documents/worker.ts`
- Delete: `lib/domain/documents/job-state.ts`
- Delete: `lib/env/documents.ts`
- Delete: `lib/email/resend.ts`
- Delete: `tests/document-worker.test.mjs`
- Delete: `tests/document-job-state.test.mjs`
- Modify: `lib/data/documents.ts`
- Modify: `lib/supabase/proxy.ts`
- Modify: `tests/proxy-security.test.mjs`
- Modify: `tests/document-routes.test.mjs`
- Create: `tests/generated-pdf-storage-migration.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `supabase/migrations/20260831120000_remove_generated_pdf_storage.sql`
- Test: `tests/document-routes.test.mjs`
- Test: `tests/proxy-security.test.mjs`
- Test: `tests/generated-pdf-storage-migration.test.mjs`

**Interfaces:**
- Consumes: Task 1 session-scoped source loader and Task 2 UI, neither of which depends on Storage or worker exports.
- Produces: no scheduler/download-by-document route, no Resend dependency, and a migration that removes only generated PDF objects/policies/bucket while retaining metadata tables and request RPCs.

- [ ] **Step 1: Add failing decommissioning and migration contract tests**

Update tests to assert the normal Supabase proxy no longer bypasses `/api/internal/jobs`. Create `tests/generated-pdf-storage-migration.test.mjs`; load the migration as the executable SQL artifact and assert the literal destructive targets are limited to `storage.objects`, `storage_generated_documents_select_owner_or_admin`, and the `generated-documents` bucket. Assert the SQL contains no `drop table`, `drop function`, `truncate`, `generated_documents`, `notification_jobs`, `submit_material_request`, or `fulfill_request_line` target.

Add an application-boundary test that imports the remaining document data module and confirms on-demand generation can be loaded without `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REQUEST_EMAIL_RECIPIENTS`, `EMAIL_FROM`, or `JOB_RUNNER_SECRET`.

- [ ] **Step 2: Run focused tests and confirm the expected failure**

Run:

```powershell
node --no-warnings --test tests/document-routes.test.mjs tests/proxy-security.test.mjs tests/generated-pdf-storage-migration.test.mjs
```

Expected: failure because the scheduler bypass and persisted pipeline still exist and the migration is absent.

- [ ] **Step 3: Delete worker, stored-download, email, and job-state code**

Remove the files listed above. Trim `lib/data/documents.ts` to the official source types, shared mapping helpers, and the Task 1 session loader. Remove `loadOfficialPdfSource`, Storage constants, upload/download functions, job claim/complete/fail functions, notification functions, hashes, leases, and service-role client imports.

- [ ] **Step 4: Remove scheduler bypass and Resend dependency**

Update `lib/supabase/proxy.ts` so `/api/internal/jobs` follows the same session behavior as any removed/nonexistent application route. Remove `resend` with:

```powershell
npm uninstall resend
```

Do not change unrelated dependency versions.

- [ ] **Step 5: Add the storage cleanup migration**

Create an idempotent SQL migration containing the scoped sequence:

```sql
delete from storage.objects where bucket_id = 'generated-documents';
drop policy if exists storage_generated_documents_select_owner_or_admin on storage.objects;
delete from storage.buckets where id = 'generated-documents';
```

Do not drop document metadata tables, RPCs, request snapshots, fulfillment events, or any other Storage bucket. Do not apply the migration remotely or locally when Docker is unavailable.

- [ ] **Step 6: Remove obsolete tests and run the focused replacement tests**

Delete worker/job-state test files and remove old stored-document/scheduler cases from `tests/document-routes.test.mjs`, retaining draft and Task 1 on-demand cases. Run:

```powershell
node --no-warnings --test tests/document-routes.test.mjs tests/proxy-security.test.mjs tests/generated-pdf-storage-migration.test.mjs tests/draft-pdf.test.mjs tests/pdf-renderer.test.mjs
npx tsc --noEmit
```

Expected: all selected tests pass and TypeScript exits `0`.

- [ ] **Step 7: Run repository verification**

Run:

```powershell
npm test
npx eslint app/api/requests components/requests lib/data/documents.ts lib/domain/documents lib/supabase/proxy.ts tests/document-routes.test.mjs tests/proxy-security.test.mjs tests/generated-pdf-storage-migration.test.mjs
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all tests pass, lint/typecheck/build exit `0`, the build lists the new dynamic PDF route, and diff check is clean. If Docker is available, additionally run the scoped Supabase SQL tests without applying remote migrations; otherwise record that database execution was unavailable.

- [ ] **Step 8: Commit the decommissioning task**

```powershell
git add -A -- app/api/documents app/api/internal/jobs app/api/requests lib/data/documents.ts lib/domain/documents lib/env/documents.ts lib/email/resend.ts lib/supabase/proxy.ts tests package.json package-lock.json supabase/migrations/20260831120000_remove_generated_pdf_storage.sql
git commit -m "refactor: remove persisted PDF pipeline"
```
