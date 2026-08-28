# Reusable Server PDF Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generare e consegnare lato Next.js la distinta bozza, la richiesta ufficiale e il report finale con un renderer PDF condiviso, Storage privato ed email idempotenti.

**Architecture:** Un renderer server-only basato su `@react-pdf/renderer` trasforma DTO discriminati in `Buffer`. La bozza usa un Route Handler sincrono; richiesta ufficiale e report finale usano i record job già creati dalle RPC, un worker con lease, Supabase Storage privato e Resend. Download e UI leggono metadati autorizzati tramite RLS.

**Tech Stack:** Next.js 16 App Router/Route Handlers, React 19, TypeScript, `@react-pdf/renderer` 4.3.1, Supabase/PostgreSQL, Resend 6.24.0, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-28-reusable-server-pdf-pipeline-design.md`

## Global Constraints

- Tutti i PDF sono generati nel runtime Node.js; nessun `window.print()` o browser headless.
- La bozza non persiste dati, non prenota stock e non invia email.
- I documenti ufficiali usano soltanto snapshot ed evasioni persistite.
- I file ufficiali restano nel bucket privato `generated-documents`.
- Ogni richiesta mantiene al massimo un documento e una notifica per tipo.
- Gli endpoint verificano sessione, profilo attivo, autorizzazione e input.
- Errori PDF o email non annullano richieste o evasioni già confermate.
- Nessun deploy, push Supabase remoto o configurazione scheduler è autorizzato da questo piano.
- Preservare tutte le modifiche già presenti e non correlate.

## File map

- `lib/pdf/contracts.ts`: DTO discriminati e filename.
- `lib/pdf/render-pdf.tsx`: registrazione font, selezione template e render a `Buffer`.
- `lib/pdf/server.ts`: boundary `server-only` usato da endpoint e worker.
- `lib/pdf/document.tsx`: componenti e tre template PDF semplici.
- `lib/pdf/mappers.ts`: mapping validato da dati bozza e snapshot ai DTO.
- `lib/domain/documents/draft-pdf.ts`: caso d'uso sincrono della bozza.
- `lib/domain/documents/job-state.ts`: backoff e transizioni pure.
- `lib/domain/documents/worker.ts`: orchestrazione documenti e notifiche con dipendenze iniettate.
- `lib/data/documents.ts`: query, claim RPC, Storage e mapping metadati.
- `lib/email/resend.ts`: invio allegato PDF idempotente.
- `lib/env/documents.ts`: configurazione server validata per sottosistema.
- `lib/supabase/admin.ts`: client service-role server-only.
- `app/api/documents/draft/route.ts`: download bozza.
- `app/api/documents/[documentId]/route.ts`: download ufficiale autorizzato.
- `app/api/internal/jobs/route.ts`: ingresso scheduler autenticato.
- `components/requests/draft-print-view.tsx`: sostituzione stampa con download.
- `components/requests/request-detail.tsx`: stato e link documenti.
- `lib/data/requests.ts`, `lib/data/request-mappers.ts`: metadati documenti nel dettaglio.
- `supabase/migrations/20260828130000_add_document_worker_rpcs.sql`: claim e transizioni atomiche.
- `supabase/tests/document_jobs_test.sql`: concorrenza, lease e idempotenza SQL.
- `tests/pdf-renderer.test.mjs`: output dei tre template e multipagina.
- `tests/draft-pdf.test.mjs`: caso d'uso bozza.
- `tests/document-job-state.test.mjs`: backoff e transizioni.
- `tests/document-worker.test.mjs`: generazione, Storage, email e retry.
- `tests/document-routes.test.mjs`: contratti e autorizzazione degli handler.
- `tests/request-mappers.test.mjs`: mapping metadati documenti.
- `scripts/render-pdf-fixtures.mjs`: genera fixture locali ripetibili per il controllo visivo.

---

### Task 1: Renderer PDF condiviso

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/pdf/contracts.ts`
- Create: `lib/pdf/document.tsx`
- Create: `lib/pdf/render-pdf.tsx`
- Create: `lib/pdf/server.ts`
- Create: `tests/pdf-renderer.test.mjs`

**Interfaces:**
- Produces: `renderPdfDocument(document: PdfDocument): Promise<Buffer>` dal nucleo testabile e dal boundary server.
- Produces: `getPdfFilename(document: PdfDocument): string`
- Produces: `PdfDocument`, `PdfLine`, `PdfFulfillment`.

- [ ] **Step 1: Installare dipendenze esatte**

Run:

```powershell
npm install --save-exact @react-pdf/renderer@4.3.1 @fontsource/ibm-plex-sans@5.3.0 resend@6.24.0
```

Expected: `package.json` contiene versioni senza `^`; `package-lock.json` è aggiornato senza modificare le altre versioni intenzionalmente presenti.

- [ ] **Step 2: Scrivere il test rosso dei contratti e del renderer**

Creare `tests/pdf-renderer.test.mjs` con fixture per i tre documenti e queste asserzioni minime:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { getPdfFilename } from "../lib/pdf/contracts.ts";
import { renderPdfDocument } from "../lib/pdf/render-pdf.tsx";

const line = {
  fabtekCode: "FT-001",
  oracleSapioCode: "OR-900",
  categoryName: "Gas",
  familyName: "Flessibili",
  componentName: "Tubo",
  description: "Tubo flessibile PTFE",
  diameter: "DN10",
  material: "PTFE",
  connection: "1/2 NPT",
  unitOfMeasure: "m",
  requestedQuantity: 10,
};

const common = {
  requesterName: "Mario Rossi",
  project: "P-44",
  toolLine: "TL-2",
  utilities: "Aria compressa",
  notes: "Consegna al reparto nord",
  documentDateLabel: "28/08/2026",
  lines: [line],
};

test("renders every document kind as a real PDF", async () => {
  const documents = [
    { kind: "draft", ...common },
    { kind: "initial_request", requestNumber: 17, statusLabel: "In preparazione", ...common },
    { kind: "final_report", requestNumber: 17, statusLabel: "Evasa", ...common,
      lines: [{ ...line, fulfilledQuantity: 10, remainingQuantity: 0, fulfillments: [] }] },
  ];
  for (const document of documents) {
    const buffer = await renderPdfDocument(document);
    assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(buffer.length > 1_000);
  }
});

test("uses stable normalized filenames", () => {
  assert.equal(getPdfFilename({ kind: "draft", ...common }), "fabtek-distinta-bozza.pdf");
  assert.equal(getPdfFilename({ kind: "initial_request", requestNumber: 17, statusLabel: "In preparazione", ...common }), "fabtek-richiesta-000017.pdf");
});
```

- [ ] **Step 3: Eseguire il test e verificare il fallimento**

Run: `node --no-warnings --test tests/pdf-renderer.test.mjs`

Expected: FAIL perché `lib/pdf/contracts.ts` e `lib/pdf/render-pdf.tsx` non esistono.

- [ ] **Step 4: Definire i DTO discriminati**

Creare `lib/pdf/contracts.ts` con contratti espliciti:

```ts
export type PdfFulfillment = {
  quantity: number;
  fulfilledAtLabel: string;
  notes: string | null;
};

export type PdfLine = {
  fabtekCode: string;
  oracleSapioCode: string | null;
  categoryName: string;
  familyName: string;
  componentName: string;
  description: string;
  diameter: string | null;
  material: string;
  connection: string;
  unitOfMeasure: string;
  requestedQuantity: number;
  fulfilledQuantity?: number;
  remainingQuantity?: number;
  fulfillments?: PdfFulfillment[];
};

type PdfCommon = {
  requesterName: string;
  project: string;
  toolLine: string;
  utilities: string;
  notes: string | null;
  documentDateLabel: string;
  lines: PdfLine[];
};

export type PdfDocument =
  | ({ kind: "draft" } & PdfCommon)
  | ({ kind: "initial_request"; requestNumber: number; statusLabel: string } & PdfCommon)
  | ({ kind: "final_report"; requestNumber: number; statusLabel: string } & PdfCommon);

export function getPdfFilename(document: PdfDocument) {
  if (document.kind === "draft") return "fabtek-distinta-bozza.pdf";
  const number = String(document.requestNumber).padStart(6, "0");
  return document.kind === "initial_request"
    ? `fabtek-richiesta-${number}.pdf`
    : `fabtek-report-finale-${number}.pdf`;
}
```

- [ ] **Step 5: Implementare il documento condiviso**

Creare `lib/pdf/document.tsx` con `Document`, `Page`, `Text`, `View` e `StyleSheet`. Implementare componenti locali `PdfHeader`, `RequestData`, `MaterialTable`, `PdfFooter`; usare `fixed` per testata tabella e footer quando necessario e `render={({ pageNumber, totalPages }) => ...}` per la numerazione. La selezione template deve essere discriminata:

```tsx
export function FabtekPdf({ document }: { document: PdfDocument }) {
  const title = document.kind === "draft"
    ? "Distinta richiesta materiale — BOZZA"
    : document.kind === "initial_request"
      ? `Richiesta materiale #${document.requestNumber}`
      : `Report finale richiesta #${document.requestNumber}`;

  return (
    <Document title={title} author="Fabtek">
      <Page size="A4" style={styles.page} wrap>
        <PdfHeader title={title} />
        <RequestData document={document} />
        <MaterialTable document={document} />
        {document.kind === "draft" ? <DraftWarning /> : null}
        <PdfFooter />
      </Page>
    </Document>
  );
}
```

Usare soltanto colori del mock (`#0b2545`, `#b8752b`, `#f2f2f2`) e mantenere la tabella semplice; il report aggiunge colonne richiesta/evasa/residua e una sezione cronologia sotto ogni riga.

- [ ] **Step 6: Registrare font e produrre il Buffer**

Creare `lib/pdf/render-pdf.tsx`:

```tsx
import { Font, renderToBuffer } from "@react-pdf/renderer";
import path from "node:path";
import { FabtekPdf } from "./document.tsx";
import type { PdfDocument } from "./contracts.ts";

Font.register({
  family: "IBM Plex Sans",
  fonts: [
    { src: path.join(process.cwd(), "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(process.cwd(), "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff"), fontWeight: 600 },
  ],
});

export async function renderPdfDocument(document: PdfDocument): Promise<Buffer> {
  if (document.lines.length === 0) throw new Error("PDF_DOCUMENT_EMPTY");
  return renderToBuffer(<FabtekPdf document={document} />);
}
```

Creare `lib/pdf/server.ts` come unico ingresso per codice applicativo:

```ts
import "server-only";

export { renderPdfDocument } from "./render-pdf.tsx";
```

Route Handler e worker importano da `lib/pdf/server`; il test Node importa il nucleo `render-pdf.tsx`, evitando di aggirare il guard client nel codice applicativo.

- [ ] **Step 7: Aggiungere il caso multipagina e portare il test al verde**

Nel test duplicare la fixture fino a 80 righe, renderizzare e verificare che il buffer sia più grande del documento singolo. Run: `node --no-warnings --test tests/pdf-renderer.test.mjs`.

Expected: PASS per documenti singoli, tre tipi, filename e multipagina.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json lib/pdf tests/pdf-renderer.test.mjs
git commit -m "feat: add shared server PDF renderer"
```

---

### Task 2: Download PDF della bozza

**Files:**
- Create: `lib/pdf/mappers.ts`
- Create: `lib/domain/documents/draft-pdf.ts`
- Create: `app/api/documents/draft/route.ts`
- Modify: `components/requests/draft-print-view.tsx`
- Modify: `app/(app)/richieste/nuova/riepilogo/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/draft-pdf.test.mjs`
- Create: `tests/document-routes.test.mjs`

**Interfaces:**
- Consumes: `renderPdfDocument(PdfDocument)` e `getPdfFilename(PdfDocument)`.
- Produces: `createDraftPdf(input: unknown, dependencies: DraftPdfDependencies): Promise<ActionResult<{ buffer: Buffer; filename: string }>>`.
- Produces: `POST /api/documents/draft` con successo `application/pdf`.

- [ ] **Step 1: Scrivere i test rossi del caso d'uso**

In `tests/draft-pdf.test.mjs` coprire input valido, riga catalogo mancante e renderer non chiamato su payload invalido. Iniettare dipendenze:

```js
const result = await createDraftPdf(validInput, {
  requesterName: "Mario Rossi",
  now: () => new Date("2026-08-28T10:00:00Z"),
  loadSelections: async () => [resolvedSelection],
  render: async (document) => {
    rendered.push(document);
    return Buffer.from("%PDF-test");
  },
});
assert.equal(result.ok, true);
assert.equal(rendered[0].kind, "draft");
assert.equal(rendered[0].lines[0].requestedQuantity, 2);
```

- [ ] **Step 2: Verificare il fallimento**

Run: `node --no-warnings --test tests/draft-pdf.test.mjs`

Expected: FAIL perché il caso d'uso non esiste.

- [ ] **Step 3: Implementare mapping e caso d'uso**

Riutilizzare `validateSubmitRequest` ignorando esclusivamente `clientRequestId` come dato documentale, senza creare un secondo schema. `createDraftPdf` deve:

```ts
const validated = validateSubmitRequest(input);
if (!validated.ok) return validated;
const selections = await loadSelections(validated.data.lines);
if (selections.length !== validated.data.lines.length) {
  return { ok: false, error: { code: "INVALID_REQUEST_LINES", message: "Uno o più articoli non sono più disponibili." } };
}
for (const line of validated.data.lines) {
  const selection = selections.find((item) => item.itemVariantId === line.itemVariantId);
  if (!selection || !canAddDraftLine(toDraftLineDetails(selection), line.quantity).ok) {
    return { ok: false, error: { code: "INVALID_REQUEST_LINES", message: "La disponibilità di uno o più articoli è cambiata." } };
  }
}
const document = mapDraftPdfDocument(validated.data, requesterName, selections, now());
return { ok: true, data: { buffer: await render(document), filename: getPdfFilename(document) } };
```

Il mapper deve prendere descrizioni e dati tecnici soltanto dalle selezioni server e quantità soltanto dall'input validato.

- [ ] **Step 4: Portare il test del caso d'uso al verde**

Run: `node --no-warnings --test tests/draft-pdf.test.mjs`

Expected: PASS.

- [ ] **Step 5: Scrivere il test rosso del Route Handler**

In `tests/document-routes.test.mjs`, usare un test statico coerente con la suite esistente per verificare runtime Node, header e controlli auth:

```js
const source = await readFile("app/api/documents/draft/route.ts", "utf8");
assert.match(source, /export const runtime = "nodejs"/u);
assert.match(source, /getCurrentProfile/u);
assert.match(source, /Content-Disposition/u);
assert.match(source, /Cache-Control/u);
assert.doesNotMatch(source, /window\.print/u);
```

- [ ] **Step 6: Implementare `POST /api/documents/draft`**

Il Route Handler deve usare `getCurrentProfile`, `can(profile, "requests:create")`, limite JSON implicito del runtime e risposta binaria:

```ts
export const runtime = "nodejs";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Sessione non valida." }, { status: 401 });
  if (!profile.is_active || !can(profile, "requests:create")) {
    return Response.json({ error: "Operazione non consentita." }, { status: 403 });
  }
  let input: unknown;
  try { input = await request.json(); }
  catch { return Response.json({ error: "Dati non validi." }, { status: 400 }); }
  const result = await createDraftPdf(input, { requesterName: profile.full_name });
  if (!result.ok) return Response.json({ error: result.error.message }, { status: 422 });
  return new Response(new Uint8Array(result.data.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

Rilevare gli errori infrastrutturali, loggare soltanto un codice contestuale e rispondere `500` generico.

- [ ] **Step 7: Sostituire la stampa nel frontend**

In `DraftPrintView`, aggiungere `isDownloading` e `downloadError`. Il click invia il payload corrente, controlla `response.ok`, scarica il blob con URL temporaneo e revoca sempre l'URL:

```ts
const response = await fetch("/api/documents/draft", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    clientRequestId: draft.clientRequestId,
    project: draft.header.project,
    toolLine: draft.header.toolLine,
    utilities: draft.header.utilities,
    notes: draft.header.notes,
    lines: draft.lines,
  }),
});
```

Il bottone usa `Download`, testo `Scarica distinta bozza`, loading `Generazione PDF...`, `disabled={!canPrint || isDownloading}` e un paragrafo `role="alert"`. Rimuovere `PrintTable`, `RequestData` usati soltanto dalla stampa e tutta la sezione `.print-only`. Aggiornare la descrizione pagina da “stampa” a “scarica”.

- [ ] **Step 8: Rimuovere CSS di stampa e verificare**

Eliminare `.print-only` e `@media print` da `app/globals.css`. Run:

```powershell
node --no-warnings --test tests/draft-pdf.test.mjs tests/document-routes.test.mjs tests/request-accessibility.test.mjs
rg -n "window\.print|print-only|request-draft-print" app components
```

Expected: test PASS e `rg` senza risultati.

- [ ] **Step 9: Commit**

```powershell
git add lib/pdf/mappers.ts lib/domain/documents app/api/documents/draft components/requests/draft-print-view.tsx 'app/(app)/richieste/nuova/riepilogo/page.tsx' app/globals.css tests/draft-pdf.test.mjs tests/document-routes.test.mjs
git commit -m "feat: download server-generated draft PDF"
```

---

### Task 3: Primitive atomiche dei job documentali

**Files:**
- Create: `supabase/migrations/20260828130000_add_document_worker_rpcs.sql`
- Create: `supabase/tests/document_jobs_test.sql`
- Create: `lib/domain/documents/job-state.ts`
- Create: `tests/document-job-state.test.mjs`

**Interfaces:**
- Produces RPC: `claim_generated_document_jobs(integer, integer)`.
- Produces RPC: `complete_generated_document_job(uuid, text, text, text, text[], text)`.
- Produces RPC: `fail_generated_document_job(uuid, text, timestamptz, boolean)`.
- Produces RPC equivalenti `claim_notification_jobs`, `complete_notification_job`, `fail_notification_job`.
- Produces: `getRetryDecision(attempts: number, now: Date): { terminal: true; retryAt: null } | { terminal: false; retryAt: string }`.

- [ ] **Step 1: Scrivere il test rosso del backoff**

```js
assert.deepEqual(getRetryDecision(1, new Date("2026-08-28T10:00:00Z")), {
  terminal: false,
  retryAt: "2026-08-28T10:01:00.000Z",
});
assert.equal(getRetryDecision(5, new Date()).terminal, true);
```

Run: `node --no-warnings --test tests/document-job-state.test.mjs`; Expected: FAIL.

- [ ] **Step 2: Implementare backoff deterministico**

Usare `MAX_ATTEMPTS = 5`, ritardi `[60, 300, 900, 3600]` secondi e nessun jitter nel dominio testabile. Portare il test al verde.

- [ ] **Step 3: Scrivere la migration con claim `FOR UPDATE SKIP LOCKED`**

Ogni claim deve selezionare job `pending` pronti o `processing` con lease scaduto, ordinarli per `next_attempt_at, created_at`, aggiornarli a `processing`, incrementare `attempts` e restituire ID, request ID, tipo/versione, tentativo e lease. Struttura obbligatoria:

```sql
with candidates as (
  select id
  from public.generated_documents
  where (status = 'pending' and next_attempt_at <= now())
     or (status = 'processing' and lease_expires_at < now())
  order by next_attempt_at, created_at
  for update skip locked
  limit greatest(1, least(p_limit, 20))
), claimed as (
  update public.generated_documents job
  set status = 'processing', attempts = attempts + 1,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))),
      last_error = null, updated_at = now()
  from candidates where job.id = candidates.id
  returning job.*
)
select id, request_id, document_type, template_version, attempts from claimed;
```

Le funzioni complete/fail devono aggiornare soltanto righe `processing` con lease non scaduto. `complete_generated_document_job` aggiorna documento e inserisce `notification_jobs` nella stessa transazione con `on conflict (request_id, document_type) do nothing`. Revocare `public`, `anon`, `authenticated`; concedere soltanto a `service_role`.

- [ ] **Step 4: Aggiungere test SQL di sicurezza e idempotenza**

`supabase/tests/document_jobs_test.sql` deve verificare con pgTAP:

- un solo claim per job;
- recupero di un lease scaduto;
- rifiuto completamento senza lease valido;
- un solo `notification_jobs` dopo retry;
- `authenticated` non può eseguire le RPC;
- errore terminale produce `failed`, errore ritentabile produce `pending` e `next_attempt_at` futuro.

- [ ] **Step 5: Validare localmente la migration**

Run:

```powershell
npx supabase db reset --local
npx supabase test db supabase/tests/document_jobs_test.sql
node --no-warnings --test tests/document-job-state.test.mjs
```

Expected: migration completa e test PASS. Non usare `db reset --linked` e non eseguire `db push` remoto.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260828130000_add_document_worker_rpcs.sql supabase/tests/document_jobs_test.sql lib/domain/documents/job-state.ts tests/document-job-state.test.mjs
git commit -m "feat: add atomic document job leasing"
```

---

### Task 4: Repository documenti, configurazione e worker PDF

**Files:**
- Create: `lib/env/documents.ts`
- Create: `lib/supabase/admin.ts`
- Create: `lib/data/documents.ts`
- Extend: `lib/pdf/mappers.ts`
- Create: `lib/domain/documents/worker.ts`
- Create: `tests/document-worker.test.mjs`

**Interfaces:**
- Consumes: RPC job Task 3 e `renderPdfDocument` Task 1.
- Produces: `processDocumentJobs(options?: DocumentJobOptions, dependencies?: Partial<DocumentWorkerDependencies>): Promise<JobBatchResult>`.
- Produces: `loadOfficialPdfSource(requestId): Promise<OfficialPdfSource>`.
- Produces: `uploadGeneratedPdf(path, buffer): Promise<void>`.

- [ ] **Step 1: Scrivere i test rossi del worker documenti**

Iniettare dipendenze e verificare chiamate in ordine:

```js
const result = await processDocumentJobs({ batchSize: 5 }, {
  claimDocuments: async () => [job],
  loadSource: async () => officialSource,
  render: async (document) => Buffer.from("%PDF-test"),
  upload: async (path, buffer) => uploads.push({ path, buffer }),
  completeDocument: async (input) => completions.push(input),
  failDocument: async (input) => failures.push(input),
  now: () => new Date("2026-08-28T10:00:00Z"),
});
assert.deepEqual(result, { claimed: 1, completed: 1, failed: 0 });
assert.equal(uploads[0].path, "requests/REQUEST_ID/initial-request-v1.pdf");
assert.match(completions[0].sha256, /^[0-9a-f]{64}$/u);
```

Aggiungere casi: report usa evasioni, errore render chiama fail, upload riuscito seguito da errore complete resta ritentabile con lo stesso path.

- [ ] **Step 2: Verificare il fallimento**

Run: `node --no-warnings --test tests/document-worker.test.mjs`; Expected: FAIL.

- [ ] **Step 3: Implementare configurazione isolata**

`lib/env/documents.ts` espone funzioni separate affinché la bozza non dipenda da email:

```ts
export function getWorkerConfig() {
  return {
    jobSecret: required("JOB_RUNNER_SECRET"),
    batchSize: boundedInteger(process.env.DOCUMENT_JOB_BATCH_SIZE, 5, 1, 20),
    leaseSeconds: boundedInteger(process.env.DOCUMENT_JOB_LEASE_SECONDS, 300, 30, 900),
  };
}

export function getEmailConfig() {
  return {
    apiKey: required("RESEND_API_KEY"),
    from: required("EMAIL_FROM"),
    recipients: parseRecipients(required("REQUEST_EMAIL_RECIPIENTS")),
  };
}
```

Non leggere o validare queste variabili all'import del modulo.

- [ ] **Step 4: Creare il client service-role**

`lib/supabase/admin.ts` usa `createClient` da `@supabase/supabase-js`, `server-only`, `auth: { persistSession: false, autoRefreshToken: false }` e valida URL/service key al momento della chiamata. Non esportare il client da moduli client-safe.

- [ ] **Step 5: Implementare il repository documenti**

`lib/data/documents.ts` deve:

- chiamare le RPC tipizzando e validando ogni riga restituita;
- caricare richiesta con profilo richiedente, snapshot righe ed evasioni ordinate;
- usare `collectPaginatedRows` per relazioni potenzialmente lunghe;
- caricare con `upsert: true`, `contentType: "application/pdf"`, `cacheControl: "0"` nel path deterministico;
- non loggare payload o destinatari;
- distinguere `DocumentDataError` con un codice interno stabile.

- [ ] **Step 6: Estendere i mapper PDF ufficiali**

Esportare:

```ts
export function mapOfficialPdfDocument(
  source: OfficialPdfSource,
  kind: "initial_request" | "final_report",
): PdfDocument
```

Rifiutare snapshot incompleti. `initial_request` usa `requested_quantity`; `final_report` richiede quantità evase/residue ed eventi associati. Formattare date in `Europe/Rome` con formatter condiviso.

- [ ] **Step 7: Implementare `processDocumentJobs`**

Per ogni job: load → map → render → SHA-256 → upload → risoluzione di destinatari/oggetto → complete atomico con creazione notifica. Isolare ogni job in `try/catch`; usare `getRetryDecision(job.attempts, now())`; troncare `last_error` a un codice massimo di 240 caratteri senza stack. Il batch prosegue dopo un errore singolo. Se la configurazione email manca, il documento resta ritentabile: il file eventualmente già caricato viene riutilizzato tramite lo stesso path deterministico.

- [ ] **Step 8: Portare i test al verde**

Run:

```powershell
node --no-warnings --test tests/document-worker.test.mjs tests/pdf-renderer.test.mjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add lib/env lib/supabase/admin.ts lib/data/documents.ts lib/pdf/mappers.ts lib/domain/documents/worker.ts tests/document-worker.test.mjs
git commit -m "feat: process official PDF jobs"
```

---

### Task 5: Email idempotente e ingresso scheduler

**Files:**
- Create: `lib/email/resend.ts`
- Extend: `lib/domain/documents/worker.ts`
- Create: `app/api/internal/jobs/route.ts`
- Modify: `tests/document-worker.test.mjs`
- Modify: `tests/document-routes.test.mjs`

**Interfaces:**
- Produces: `sendDocumentEmail(input): Promise<{ providerMessageId: string }>`.
- Produces: `processNotificationJobs(options?: DocumentJobOptions, dependencies?: Partial<NotificationWorkerDependencies>): Promise<JobBatchResult>`.
- Produces: `POST /api/internal/jobs` protetto da Bearer secret.

- [ ] **Step 1: Scrivere test rossi email e notifiche**

Verificare che il worker scarichi un documento già completato, non richiami il renderer, invii allegato base64 e completi il job. L'idempotency key deve essere stabile:

```js
assert.equal(sendCalls[0].idempotencyKey, `document-notification/${job.id}`);
assert.equal(sendCalls[0].attachment.filename, "fabtek-richiesta-000017.pdf");
assert.equal(renderCalls.length, 0);
```

Simulare errore Resend e verificare `failNotification` con retry.

- [ ] **Step 2: Implementare adapter Resend**

`lib/email/resend.ts` usa `new Resend(apiKey).emails.send(payload, { idempotencyKey })`, allegato `{ filename, content: buffer.toString("base64") }`, HTML statico minimale e testo equivalente. Se `error` è valorizzato o manca `data.id`, sollevare `DocumentEmailError` senza includere destinatari o messaggi provider nell'errore pubblico.

- [ ] **Step 3: Implementare il worker notifiche**

Claim → carica documento completato → scarica Buffer → costruisce filename/copy → invia → completa. Il retry non modifica `generated_documents` e non rigenera il PDF.

- [ ] **Step 4: Scrivere test rosso autenticazione scheduler**

In `tests/document-routes.test.mjs` verificare che l'handler legga `Authorization`, usi `timingSafeEqual`, runtime Node e chiami entrambi i processor.

- [ ] **Step 5: Implementare `POST /api/internal/jobs`**

Confrontare bytes di due buffer della stessa lunghezza tramite `crypto.timingSafeEqual`; rifiutare con `401` ogni header assente o malformato. Dopo autenticazione chiamare prima documenti poi notifiche e rispondere solo con conteggi:

```ts
return Response.json({ documents, notifications }, {
  headers: { "Cache-Control": "no-store" },
});
```

Nessun dettaglio job o errore interno nella risposta.

- [ ] **Step 6: Verificare**

Run:

```powershell
node --no-warnings --test tests/document-worker.test.mjs tests/document-routes.test.mjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add lib/email/resend.ts lib/domain/documents/worker.ts app/api/internal/jobs/route.ts tests/document-worker.test.mjs tests/document-routes.test.mjs
git commit -m "feat: send generated documents idempotently"
```

---

### Task 6: Download ufficiale e stato documenti nel dettaglio

**Files:**
- Modify: `lib/data/request-mappers.ts`
- Modify: `lib/data/requests.ts`
- Extend: `lib/data/documents.ts`
- Create: `app/api/documents/[documentId]/route.ts`
- Modify: `components/requests/request-detail.tsx`
- Modify: `tests/request-mappers.test.mjs`
- Modify: `tests/document-routes.test.mjs`

**Interfaces:**
- Extends: `RequestDetail.documents: RequestDocumentView[]`.
- Produces: `getAuthorizedDocument(documentId): Promise<DownloadableDocument | null>`.
- Produces: `GET /api/documents/[documentId]`.

- [ ] **Step 1: Scrivere il test rosso del mapping metadati**

Estendere la fixture richiesta con:

```js
documents: [{
  id: "50000000-0000-4000-8000-000000000001",
  document_type: "initial_request",
  status: "completed",
  completed_at: "2026-08-28T10:05:00Z",
}],
```

Verificare mapping a `{ id, kind, label, status, completedAtLabel, canDownload: true }`; un documento `pending` ha `canDownload: false`; tipo/stato sconosciuto solleva `RequestMappingError`.

- [ ] **Step 2: Estendere query e mapper**

Aggiungere al select dettaglio `documents:generated_documents(id, document_type, status, completed_at)` e ordinare l'array `initial_request`, poi `final_report`. Non esporre `storage_path`, hash o `last_error` nel DTO UI.

- [ ] **Step 3: Scrivere test rosso del download autorizzato**

Iniettare nel repository una risposta RLS: documento altrui deve risultare `null`; documento proprio completato produce metadati; pending non è scaricabile. Nel test statico handler verificare UUID, `getCurrentProfile`, `application/pdf`, `private, no-store`.

- [ ] **Step 4: Implementare repository e Route Handler**

Il repository usa il client sessione, non service-role, per leggere `generated_documents` con richiesta associata; RLS è il primo confine di autorizzazione. Solo dopo avere ottenuto metadati validi scarica lo Storage object con lo stesso client. L'handler:

- `401` sessione assente;
- `403` profilo inattivo;
- `404` UUID invalido, record non visibile, non completato o file assente;
- `200` PDF con filename determinato e `Cache-Control: private, no-store`.

- [ ] **Step 5: Aggiungere la UI documenti**

In `RequestDetail`, aggiungere una sezione “Documenti” dopo l'intestazione. Mostrare:

- `In preparazione` per pending/processing;
- `Non disponibile` per failed, senza `last_error`;
- bottone link `Scarica PDF` soltanto per completed.

Usare link normale all'endpoint per lasciare al browser il download; mantenere touch target e label accessibili con tipo documento.

- [ ] **Step 6: Verificare**

Run:

```powershell
node --no-warnings --test tests/request-mappers.test.mjs tests/document-routes.test.mjs tests/request-accessibility.test.mjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add lib/data/request-mappers.ts lib/data/requests.ts lib/data/documents.ts app/api/documents components/requests/request-detail.tsx tests/request-mappers.test.mjs tests/document-routes.test.mjs
git commit -m "feat: expose authorized request documents"
```

---

### Task 7: Verifica integrata e controllo visivo PDF

**Files:**
- Modify only if failures reveal task-scoped defects.
- Create: `scripts/render-pdf-fixtures.mjs`
- Create artifacts: `output/pdf/` (non versionare, salvo policy repository diversa).

**Interfaces:**
- Consumes all previous tasks.
- Produces evidence that draft, official request and final report work end-to-end locally.

- [ ] **Step 1: Controllare diff e dipendenze**

Run:

```powershell
git status --short
git diff --check
git diff --stat HEAD~6..HEAD
npm ls @react-pdf/renderer @fontsource/ibm-plex-sans resend
```

Expected: nessun whitespace error; versioni esatte; nessuna modifica estranea inclusa nei commit PDF.

- [ ] **Step 2: Eseguire la suite completa**

Run:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: tutti i comandi exit code 0. Non dichiarare riuscito un comando non eseguito.

- [ ] **Step 3: Validare database locale**

Run:

```powershell
npx supabase db reset --local
npx supabase test db
```

Expected: migration applicate da zero e tutti i test SQL PASS. Non collegarsi al progetto remoto.

- [ ] **Step 4: Creare il generatore ripetibile delle fixture**

Creare `scripts/render-pdf-fixtures.mjs` importando `renderPdfDocument`, usando fixture deterministiche e `mkdir("output/pdf", { recursive: true })`. Lo script scrive:

- `draft.pdf` con una riga;
- `initial-request.pdf` con almeno 40 righe;
- `final-report.pdf` con quantità ed evasioni.

Eseguire:

```powershell
node --no-warnings scripts/render-pdf-fixtures.mjs
```

Lo script deve verificare prima della scrittura che ogni buffer inizi con `%PDF-` e superi 1.000 byte. Aprire poi i tre file con un lettore PDF reale.

- [ ] **Step 5: Renderizzare e ispezionare visivamente**

Usare Poppler se disponibile:

```powershell
pdftoppm -png -r 150 output/pdf/draft.pdf output/pdf/draft
pdftoppm -png -r 150 output/pdf/initial-request.pdf output/pdf/initial-request
pdftoppm -png -r 150 output/pdf/final-report.pdf output/pdf/final-report
```

Ispezionare almeno la prima e ultima pagina di ogni documento e confrontare la bozza con `mock pdf richiesta user.pdf`: nessun URL/data Windows, nessun testo tagliato, intestazione tabella ripetuta, footer leggibile. Se Poppler non è disponibile, installarlo solo con autorizzazione oppure dichiarare esplicitamente la verifica visiva mancante.

- [ ] **Step 6: Provare gli endpoint locali**

Con sessione autenticata nel browser:

- generare e scaricare la bozza;
- inviare una richiesta e invocare una volta il worker con Bearer secret locale;
- scaricare la richiesta ufficiale dal dettaglio;
- completare una richiesta di test, invocare il worker e scaricare il report finale;
- verificare in database `completed`, hash, path e un solo job email per tipo.

Se Resend non è configurato, usare una dipendenza fake nel test integrato e dichiarare che l'invio live non è stato eseguito; non usare destinatari reali senza autorizzazione.

- [ ] **Step 7: Commit dello script di verifica**

```powershell
git add -- scripts/render-pdf-fixtures.mjs
git commit -m "test: add PDF fixture renderer"
```

Se la verifica trova difetti, tornare prima al task responsabile, aggiungere il test di regressione e correggerli nel relativo commit. Non includere modifiche estranee nel commit dello script.
