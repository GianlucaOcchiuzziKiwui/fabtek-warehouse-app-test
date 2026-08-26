# Catalogo, richieste ed evasione Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consegnare il flusso autenticato completo per ricerca catalogo, creazione richiesta, storico personale ed evasione Admin usando Supabase, RLS e RPC atomiche.

**Architecture:** Le letture passano da Server Components a un DAL Supabase server-only; le mutazioni passano da Server Actions autenticate a servizi di dominio e quindi alle RPC PostgreSQL. Il carrello è l'unico stato client persistito in `sessionStorage`; RLS e RPC restano l'autorità per identità, accesso, disponibilità, snapshot, idempotenza e stati.

**Tech Stack:** Next.js 16.3.2 App Router con Cache Components, React 19.2.8, TypeScript strict, Supabase SSR/PostgreSQL/RLS, Tailwind CSS 4, shadcn/ui, Node test runner, pgTAP/Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-08-26-user-catalog-requests-fulfillment-design.md`

## Global Constraints

- Non creare Route Handler o API REST applicative; mantenere soltanto le route Auth esistenti.
- Non importare `Caricamento Materiali.csv` e non creare prodotti o giacenze fittizi.
- Non implementare CRUD Admin di catalogo, inventario o utenti, dashboard, worker, Resend o PDF ufficiali.
- `Utilities` resta testo libero di intestazione e non è una categoria.
- Tutte le varianti esistenti e future partono con `track_inventory = false`.
- Per `track_inventory = false` non esistono controlli, prenotazioni, scarichi o movimenti inventario.
- Per `track_inventory = true` restano obbligatori lock, disponibilità, prenotazione, scarico e movimenti atomici.
- Tutte le query dipendenti da sessione/RLS restano request-time e dietro `Suspense`; non usare `use cache` per catalogo, disponibilità o richieste.
- Ogni Server Action ricontrolla sessione, profilo attivo, ruolo e input; non si fida del rendering della pagina.
- Non applicare migration al Supabase remoto e non eseguire deploy.

---

### Task 1: Semantica stock opzionale nelle RPC PostgreSQL

**Files:**
- Create: `supabase/tests/stock_tracking_test.sql`
- Create: `supabase/migrations/20260826150000_add_variant_stock_tracking.sql`
- Modify: `products.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Produces: `item_variants.track_inventory boolean not null default false`.
- Produces: `get_catalog_availability()` con colonne `(item_variant_id uuid, track_inventory boolean, available_quantity integer, low_stock_threshold integer, stock_status text)`.
- Preserves: firme esistenti di `submit_material_request(...)` e `fulfill_request_line(...)`.

- [ ] **Step 1: Scrivere il test SQL che descrive i due comportamenti stock**

Creare una fixture pgTAP transazionale con un User, un Admin, categoria/famiglia/componente, due varianti e una sola riga inventario. Asserire prima dell'implementazione:

```sql
select plan(12);

select is(
  (select track_inventory from public.item_variants where fabtek_code = 'UNTRACKED-1'),
  false,
  'new variants do not track inventory by default'
);

select lives_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000001',
    'P-1', 'T-1', 'Utility libera', null,
    jsonb_build_array(jsonb_build_object(
      'item_variant_id', '20000000-0000-0000-0000-000000000001',
      'category_id', '30000000-0000-0000-0000-000000000001',
      'quantity', 250
    ))
  ) $$,
  'untracked variant can be requested without inventory row'
);

select is(
  (select count(*) from public.inventory_movements where item_variant_id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'untracked request creates no reservation movement'
);

select throws_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000002',
    'P-1', 'T-1', 'Utility libera', null,
    jsonb_build_array(jsonb_build_object(
      'item_variant_id', '20000000-0000-0000-0000-000000000002',
      'category_id', '30000000-0000-0000-0000-000000000001',
      'quantity', 6
    ))
  ) $$,
  'P0001',
  'INSUFFICIENT_STOCK_OR_INVALID_VARIANT',
  'tracked variant cannot exceed availability'
);
```

Le altre otto asserzioni devono essere esplicite e usare gli ID deterministici della fixture:

```sql
select results_eq(
  $$ select track_inventory, available_quantity, stock_status
     from public.get_catalog_availability()
     where item_variant_id = '20000000-0000-0000-0000-000000000001' $$,
  $$ values (false, null::integer, 'unlimited'::text) $$,
  'untracked availability is unlimited and has no fake quantity'
);

select lives_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000003', 'P-2', 'T-2', 'Utility', null,
    jsonb_build_array(jsonb_build_object(
      'item_variant_id', '20000000-0000-0000-0000-000000000002',
      'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 4
    ))
  ) $$,
  'tracked variant can reserve available stock'
);

select is(
  (select reserved_quantity from public.inventory where item_variant_id = '20000000-0000-0000-0000-000000000002'),
  4,
  'tracked request reserves stock'
);

select is(
  (select count(*) from public.inventory_movements
   where item_variant_id = '20000000-0000-0000-0000-000000000002'
     and movement_type = 'reservation'),
  1::bigint,
  'tracked request records one reservation movement'
);

select lives_ok(
  $$ select * from public.fulfill_request_line(
    (select id from public.material_request_lines where item_variant_id = '20000000-0000-0000-0000-000000000001'),
    250, '40000000-0000-0000-0000-000000000001', null
  ) $$,
  'untracked fulfillment succeeds without inventory'
);

select is(
  (select count(*) from public.inventory_movements
   where item_variant_id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'untracked fulfillment creates no inventory movement'
);

select lives_ok(
  $$ do $block$
     declare v_line_id uuid := (
       select id from public.material_request_lines
       where item_variant_id = '20000000-0000-0000-0000-000000000002'
     );
     begin
       perform * from public.fulfill_request_line(v_line_id, 2, '40000000-0000-0000-0000-000000000002', null);
       perform * from public.fulfill_request_line(v_line_id, 2, '40000000-0000-0000-0000-000000000002', null);
     end $block$ $$,
  'tracked fulfillment retry is idempotent'
);

select results_eq(
  $$ select i.on_hand_quantity, i.reserved_quantity, line.fulfilled_quantity,
            (select count(*)::integer from public.fulfillment_events event where event.request_line_id = line.id)
     from public.inventory i
     join public.material_request_lines line on line.item_variant_id = i.item_variant_id
     where i.item_variant_id = '20000000-0000-0000-0000-000000000002' $$,
  $$ values (8, 2, 2, 1) $$,
  'tracked fulfillment mutates inventory and event history once'
);

select * from finish();
```

- [ ] **Step 2: Eseguire il test e verificare il RED**

Run: `npx supabase test db supabase/tests/stock_tracking_test.sql`

Expected: FAIL perché `track_inventory` e la nuova firma di `get_catalog_availability()` non esistono.

- [ ] **Step 3: Implementare la migration minima**

La migration deve:

```sql
begin;

alter table public.item_variants
add column track_inventory boolean not null default false;

comment on column public.item_variants.track_inventory is
  'When false, request and fulfillment quantities do not reserve or mutate inventory.';
```

Sostituire `get_catalog_availability()` facendo partire la query da `item_variants` e usando `left join inventory`:

```sql
case when iv.track_inventory then i.on_hand_quantity - i.reserved_quantity end,
case when iv.track_inventory then i.low_stock_threshold end,
case
  when not iv.track_inventory then 'unlimited'
  when i.item_variant_id is null then 'out_of_stock'
  when i.on_hand_quantity - i.reserved_quantity <= 0 then 'out_of_stock'
  when i.on_hand_quantity - i.reserved_quantity <= i.low_stock_threshold then 'low_stock'
  else 'available'
end
```

In `submit_material_request`:

- bloccare solo `inventory` delle varianti `track_inventory = true`;
- validare tutte le varianti attive e compatibili, ma richiedere inventario/disponibilità solo quando il flag è true;
- aggiornare `reserved_quantity` e inserire movimenti soltanto per righe tracciate.

In `fulfill_request_line`:

- leggere `track_inventory` insieme alla variante;
- eseguire lock, controllo e update inventario solo quando true;
- inserire il movimento di fulfillment solo quando true;
- conservare sempre evento, `fulfilled_quantity` e calcolo stati.

Ripristinare i `revoke/grant execute` delle tre funzioni e chiudere con `commit`.

- [ ] **Step 4: Verificare GREEN, lint SQL e reset completo**

Run:

```powershell
npx supabase db reset --local
npx supabase test db supabase/tests/stock_tracking_test.sql
npx supabase db lint --local --schema public --level warning --fail-on error
```

Expected: reset riuscito, 12 test pgTAP passati, `No schema errors found`.

- [ ] **Step 5: Allineare i documenti di dominio**

Aggiornare soltanto le sezioni disponibilità, inventario, operazioni transazionali, regole non negoziabili e criteri di accettazione di `products.md`; aggiornare RLS matrix, flussi e fase inventario in `ARCHITECTURE.md`. Esplicitare che la modalità illimitata è un dato autorevole della variante e non un bypass client.

- [ ] **Step 6: Controllare e committare**

Run: `git diff --check` e `git diff -- supabase products.md ARCHITECTURE.md`

Commit:

```powershell
git add -- supabase/migrations/20260826150000_add_variant_stock_tracking.sql supabase/tests/stock_tracking_test.sql products.md ARCHITECTURE.md
git commit -m "feat: support variants without stock tracking"
```

---

### Task 2: Contratti, validazione e mapping degli errori

**Files:**
- Create: `lib/domain/action-result.ts`
- Create: `lib/domain/errors.ts`
- Create: `lib/domain/requests/contracts.ts`
- Create: `lib/domain/requests/validation.ts`
- Create: `lib/domain/fulfillment/validation.ts`
- Create: `tests/request-validation.test.mjs`
- Create: `tests/domain-errors.test.mjs`

**Interfaces:**
- Produces: `ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError }`.
- Produces: `SubmitRequestInput`, `SubmitRequestLineInput`, `FulfillRequestInput`.
- Produces: `validateSubmitRequest(input: unknown)` e `validateFulfillment(input: unknown)` con risultato discriminato.
- Produces: `toActionError(error: unknown): ActionError`.

- [ ] **Step 1: Scrivere test RED per i contratti di richiesta**

```js
test("accepts a valid untracked request payload", () => {
  const result = validateSubmitRequest({
    clientRequestId: "10000000-0000-4000-8000-000000000001",
    project: " P-44 ",
    toolLine: " TL-2 ",
    utilities: " Aria compressa ",
    notes: " ",
    lines: [{
      itemVariantId: "20000000-0000-4000-8000-000000000001",
      categoryId: "30000000-0000-4000-8000-000000000001",
      quantity: 250,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.project, "P-44");
  assert.equal(result.data.notes, null);
});

test("rejects duplicate variants and invalid quantities", () => {
  const result = validateSubmitRequest({
    clientRequestId: crypto.randomUUID(),
    project: "P", toolLine: "T", utilities: "U",
    lines: [line(0), line(2)],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_REQUEST_LINES");
});
```

Aggiungere casi per richiesta vuota, limiti SQL 120/120/240, note normalizzate, UUID non validi, quantità decimale e quantità oltre il limite applicativo `999999`.

- [ ] **Step 2: Eseguire i test e verificare il RED**

Run: `node --no-warnings --test tests/request-validation.test.mjs tests/domain-errors.test.mjs`

Expected: FAIL con moduli non trovati.

- [ ] **Step 3: Implementare tipi e validatori senza nuove dipendenze**

Usare type guard e funzioni pure. La firma principale deve essere:

```ts
export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

export function validateSubmitRequest(input: unknown): ValidationResult<SubmitRequestInput>;
export function validateFulfillment(input: unknown): ValidationResult<FulfillRequestInput>;
```

`validateFulfillment` accetta soltanto `requestLineId`, `quantity`, `idempotencyKey` e `notes`; quantità `1..999999` e note massimo 500 caratteri.

`toActionError` deve mappare almeno:

```ts
const DATABASE_ERROR_CODES = {
  "42501": { code: "FORBIDDEN", message: "Operazione non consentita." },
  "P0001": { code: "INSUFFICIENT_STOCK", message: "La disponibilità di uno o più articoli è cambiata." },
  "22023": { code: "INVALID_INPUT", message: "Controlla i dati inseriti." },
  "23514": { code: "INVALID_QUANTITY", message: "La quantità indicata non è valida." },
  "P0002": { code: "NOT_FOUND", message: "La risorsa richiesta non è disponibile." },
} as const;
```

Gli errori sconosciuti diventano `UNEXPECTED_ERROR` senza includere messaggi SQL.

- [ ] **Step 4: Verificare GREEN**

Run: `node --no-warnings --test tests/request-validation.test.mjs tests/domain-errors.test.mjs`

Expected: tutti i test passano.

- [ ] **Step 5: Committare**

```powershell
git add -- lib/domain tests/request-validation.test.mjs tests/domain-errors.test.mjs
git commit -m "feat: add request domain contracts"
```

---

### Task 3: DAL catalogo e view model disponibilità

**Files:**
- Create: `lib/data/catalog.ts`
- Create: `lib/data/catalog-mappers.ts`
- Create: `tests/catalog-mappers.test.mjs`
- Create: `components/catalog/availability-badge.tsx`
- Create: `components/catalog/catalog-filters.tsx`
- Create: `components/catalog/catalog-results.tsx`
- Create: `components/shared/empty-state.tsx`
- Create: `components/shared/page-heading.tsx`
- Create: `app/(app)/catalogo/page.tsx`
- Create: `app/(app)/catalogo/loading.tsx`

**Interfaces:**
- Produces: `CatalogFilters`, `CatalogOption`, `CatalogVariant`, `StockView`.
- Produces: `getCatalogFilters(filters)`, `searchCatalog(filters)`, `getCatalogVariantSelection(variantId, categoryId)`.
- Produces: `getAvailabilityLabel(stock): { label: string; tone: "good" | "warning" | "danger" | "neutral" }`.

- [ ] **Step 1: Scrivere il test RED del mapper disponibilità**

```js
test("renders untracked variants as unlimited without a fake quantity", () => {
  assert.deepEqual(
    getAvailabilityLabel({
      trackInventory: false,
      availableQuantity: null,
      lowStockThreshold: null,
      status: "unlimited",
    }),
    { label: "Disponibilità non limitata", tone: "neutral" },
  );
});

test("maps tracked availability states", () => {
  assert.equal(getAvailabilityLabel(stock("available", 8)).label, "8 disponibili");
  assert.equal(getAvailabilityLabel(stock("low_stock", 2)).tone, "warning");
  assert.equal(getAvailabilityLabel(stock("out_of_stock", 0)).tone, "danger");
});
```

Aggiungere test che il mapper scarti righe prive di ID/codice e non inventi datasheet o supplier.

- [ ] **Step 2: Verificare RED**

Run: `node --no-warnings --test tests/catalog-mappers.test.mjs`

Expected: FAIL con modulo mancante.

- [ ] **Step 3: Implementare mapper e DAL server-only**

`searchCatalog` deve:

- chiamare `requirePermission("catalog:read")`;
- limitare `query` a 120 caratteri e `page` a intero positivo;
- usare pagine da 24 risultati;
- filtrare categorie/famiglie/componenti soltanto tramite relazioni attive;
- cercare con `.or("fabtek_code.ilike...,oracle_sapio_code.ilike...,description.ilike...")` dopo escaping dei caratteri PostgREST `%`, `_`, `,`, `(` e `)`;
- selezionare soltanto colonne mostrate dalla UI;
- chiamare `get_catalog_availability` e fare merge per ID senza esporre inventario completo;
- restituire `{ items, page, pageSize, total }`.

Non applicare `use cache`: client Supabase e RLS dipendono dai cookie.

- [ ] **Step 4: Implementare `/catalogo` e i componenti presentazionali**

La pagina usa `searchParams: Promise<Record<string, string | string[] | undefined>>`, con contenuto runtime dentro `Suspense`. Filtri e paginazione usano link/form GET, quindi sono rappresentati nell'URL. Mostrare:

- titolo e testo introduttivo;
- ricerca codice/descrizione;
- select categoria, famiglia e componente dipendenti;
- risultati desktop in tabella e mobile in card;
- dati tecnici e `AvailabilityBadge`;
- CTA “Richiedi questo articolo” con `variantId` e `categoryId` quando la variante è associata a una categoria selezionabile;
- stato vuoto distinto tra catalogo vuoto e nessun risultato.

- [ ] **Step 5: Verificare GREEN e typecheck mirato**

Run:

```powershell
node --no-warnings --test tests/catalog-mappers.test.mjs
npx tsc --noEmit
```

Expected: test e typecheck passano.

- [ ] **Step 6: Committare**

```powershell
git add -- lib/data/catalog.ts lib/data/catalog-mappers.ts components/catalog components/shared app/(app)/catalogo tests/catalog-mappers.test.mjs
git commit -m "feat: add searchable catalog"
```

---

### Task 4: Shell applicativa, home e draft carrello

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/page.tsx`
- Create: `components/layout/app-navigation.tsx`
- Create: `components/home/home-actions.tsx`
- Create: `components/requests/request-draft-provider.tsx`
- Create: `lib/domain/requests/draft.ts`
- Create: `tests/request-draft.test.mjs`

**Interfaces:**
- Produces: `RequestDraft`, `RequestDraftLine`, `DraftAction`.
- Produces: `createEmptyDraft()`, `requestDraftReducer(draft, action)`.
- Produces: `useRequestDraft()` con `setHeader`, `addLine`, `setQuantity`, `removeLine`, `resetDraft`.

- [ ] **Step 1: Scrivere test RED del reducer**

```js
test("adding the same variant updates one cart line", () => {
  const first = requestDraftReducer(createEmptyDraft(), {
    type: "add-line",
    line: variantLine({ quantity: 2 }),
  });
  const second = requestDraftReducer(first, {
    type: "add-line",
    line: variantLine({ quantity: 3 }),
  });

  assert.equal(second.lines.length, 1);
  assert.equal(second.lines[0].quantity, 3);
});
```

Aggiungere test per modifica quantità, rimozione, reset con nuovo UUID e rifiuto di uno snapshot `sessionStorage` con versione o forma non valida.

- [ ] **Step 2: Verificare RED**

Run: `node --no-warnings --test tests/request-draft.test.mjs`

Expected: FAIL con modulo mancante.

- [ ] **Step 3: Implementare reducer e provider**

La forma persistita è:

```ts
export type RequestDraft = {
  version: 1;
  clientRequestId: string;
  header: { project: string; toolLine: string; utilities: string; notes: string };
  lines: RequestDraftLine[];
};
```

Leggere `sessionStorage` solo dopo mount, usare chiave `fabtek:material-request-draft:v1`, validare prima di ripristinare e non persistire nome utente, ruoli o disponibilità autorevoli.

- [ ] **Step 4: Integrare provider, navigazione e home**

Avvolgere i children del layout autenticato nel provider. Aggiungere navigazione a Home, Catalogo e Richieste; per Admin aggiungere Gestisci richieste. La home mostra esattamente tre tile:

- Crea richiesta materiale → `/richieste/nuova`;
- Cerca info materiali → `/catalogo`;
- Controlla/Gestisci richieste → route dipendente dal ruolo.

Mantenere nome, badge ruolo e logout già esistenti.

- [ ] **Step 5: Verificare GREEN**

Run:

```powershell
node --no-warnings --test tests/request-draft.test.mjs
npx tsc --noEmit
```

- [ ] **Step 6: Committare**

```powershell
git add -- app/(app)/layout.tsx app/(app)/page.tsx components/layout components/home components/requests/request-draft-provider.tsx lib/domain/requests/draft.ts tests/request-draft.test.mjs
git commit -m "feat: add app navigation and request draft"
```

---

### Task 5: Nuova richiesta, selezione guidata e riepilogo bozza

**Files:**
- Create: `app/(app)/richieste/nuova/page.tsx`
- Create: `app/(app)/richieste/nuova/loading.tsx`
- Create: `app/(app)/richieste/nuova/riepilogo/page.tsx`
- Create: `components/requests/request-header-form.tsx`
- Create: `components/requests/request-catalog-picker.tsx`
- Create: `components/requests/cart-summary.tsx`
- Create: `components/requests/add-to-request-button.tsx`
- Create: `components/requests/draft-print-view.tsx`
- Create: `tests/request-line-rules.test.mjs`

**Interfaces:**
- Consumes: `getCatalogFilters`, `searchCatalog`, `getCatalogVariantSelection`.
- Consumes: `useRequestDraft()`.
- Produces: `canAddDraftLine(line, requestedQuantity)` per validazione UI non autorevole.

- [ ] **Step 1: Scrivere test RED delle regole quantità client**

```js
test("untracked variants accept any bounded positive integer", () => {
  assert.deepEqual(canAddDraftLine(untrackedVariant(), 250), { ok: true });
});

test("tracked variants cannot exceed observed availability", () => {
  assert.equal(canAddDraftLine(trackedVariant(4), 5).error.code, "INSUFFICIENT_STOCK");
});

test("zero, decimals and values above 999999 are rejected", () => {
  for (const quantity of [0, 1.5, 1000000]) {
    assert.equal(canAddDraftLine(untrackedVariant(), quantity).ok, false);
  }
});
```

- [ ] **Step 2: Verificare RED**

Run: `node --no-warnings --test tests/request-line-rules.test.mjs`

- [ ] **Step 3: Implementare intestazione e picker**

`/richieste/nuova` mostra prima i campi obbligatori, poi riusa il catalogo in modalità richiesta. I query parameter guidano categoria/famiglia/componente. Ogni variante parte con input quantità `0`; il pulsante aggiungi resta disabilitato fino a quantità valida. Il contatore carrello e il link al riepilogo restano sticky ma non coprono contenuti su mobile.

Quando si arriva da `/catalogo?requestVariant=<id>&category=<id>`, rileggere la variante dal DAL, non fidarsi di descrizioni o stock passati dal client.

- [ ] **Step 4: Implementare riepilogo e stampa bozza**

Il riepilogo mostra tutti i campi del mock PDF, permette quantità/rimozione e rende una sezione `print-only` A4 con:

- titolo “Distinta richiesta materiale — bozza”;
- dati intestazione;
- tabella Part #, Categoria, Famiglia, Articolo, Misura, Materiale, Connessione, Quantità;
- dicitura “Documento non ancora confermato al magazzino”.

Il pulsante usa `window.print()`. In `app/globals.css` aggiungere regole `@media print` per nascondere shell/azioni e impedire spezzatura delle righe.

- [ ] **Step 5: Verificare GREEN e typecheck**

Run:

```powershell
node --no-warnings --test tests/request-line-rules.test.mjs
npx tsc --noEmit
```

- [ ] **Step 6: Committare**

```powershell
git add -- app/(app)/richieste/nuova app/globals.css components/requests tests/request-line-rules.test.mjs
git commit -m "feat: add material request builder"
```

---

### Task 6: Invio idempotente della richiesta

**Files:**
- Create: `lib/domain/requests/submit-request.ts`
- Create: `app/(app)/richieste/nuova/actions.ts`
- Create: `components/requests/submit-request-button.tsx`
- Create: `tests/submit-request.test.mjs`

**Interfaces:**
- Consumes: `validateSubmitRequest`, `requirePermission("requests:create")`.
- Produces: `submitMaterialRequest(input, dependencies?)`.
- Produces: `submitRequestAction(input): Promise<ActionResult<{ requestId: string; requestNumber: number }>>`.

- [ ] **Step 1: Scrivere test RED del servizio con una dipendenza RPC controllata**

```js
test("passes only validated identifiers and header fields to the RPC", async () => {
  const calls = [];
  const result = await submitMaterialRequest(validInput(), {
    callRpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [{ request_id: REQUEST_ID, request_number: 17 }], error: null };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].name, "submit_material_request");
  assert.deepEqual(calls[0].args.p_lines, [{
    item_variant_id: VARIANT_ID,
    category_id: CATEGORY_ID,
    quantity: 2,
  }]);
});
```

Aggiungere test per errore mappato e risposta RPC vuota.

- [ ] **Step 2: Verificare RED**

Run: `node --no-warnings --test tests/submit-request.test.mjs`

- [ ] **Step 3: Implementare servizio e Server Action**

L'action:

```ts
"use server";

export async function submitRequestAction(
  input: unknown,
): Promise<ActionResult<{ requestId: string; requestNumber: number }>> {
  await requirePermission("requests:create");
  const result = await submitMaterialRequest(input);
  if (result.ok) {
    revalidatePath("/richieste");
    revalidatePath(`/richieste/${result.data.requestId}`);
  }
  return result;
}
```

Non effettuare redirect dentro l'action: il Client Component deve svuotare il draft solo quando `ok === true`, poi usare `router.replace` verso il dettaglio con un parametro `created=1` per mostrare la conferma.

- [ ] **Step 4: Collegare il pulsante di invio**

Usare `useTransition`; bloccare invii concorrenti nella UI ma riutilizzare sempre lo stesso `clientRequestId` in caso di retry. Mostrare errori attesi senza perdere draft o modificare l'UUID.

- [ ] **Step 5: Verificare GREEN**

Run:

```powershell
node --no-warnings --test tests/submit-request.test.mjs
npx tsc --noEmit
```

- [ ] **Step 6: Committare**

```powershell
git add -- lib/domain/requests/submit-request.ts app/(app)/richieste/nuova/actions.ts components/requests/submit-request-button.tsx tests/submit-request.test.mjs
git commit -m "feat: submit material requests"
```

---

### Task 7: Storico personale e dettaglio protetto

**Files:**
- Create: `lib/data/requests.ts`
- Create: `lib/data/request-mappers.ts`
- Create: `tests/request-mappers.test.mjs`
- Create: `components/requests/request-status-badge.tsx`
- Create: `components/requests/request-list.tsx`
- Create: `components/requests/request-detail.tsx`
- Create: `app/(app)/richieste/page.tsx`
- Create: `app/(app)/richieste/loading.tsx`
- Create: `app/(app)/richieste/[requestId]/page.tsx`
- Create: `app/(app)/richieste/[requestId]/loading.tsx`
- Create: `app/(app)/richieste/[requestId]/not-found.tsx`

**Interfaces:**
- Produces: `RequestListItem`, `RequestDetail`, `RequestLineDetail`, `FulfillmentHistoryItem`.
- Produces: `listOwnRequests(filters)`, `getRequestDetail(requestId)`.
- Produces: `mapRequestStatus(status)` e `remainingQuantity(line)`.

- [ ] **Step 1: Scrivere test RED dei mapper storico**

```js
test("derives remaining quantity and preserves every fulfillment event", () => {
  const detail = mapRequestDetail(requestRow({
    requested_quantity: 10,
    fulfilled_quantity: 7,
    fulfillment_events: [event(3), event(4)],
  }));

  assert.equal(detail.lines[0].remainingQuantity, 3);
  assert.deepEqual(detail.lines[0].fulfillments.map((item) => item.quantity), [3, 4]);
});
```

Aggiungere test per stati italiani, ordinamento eventi e timestamp formattati `it-IT`/`Europe/Rome` tramite una funzione di formattazione esplicita.

- [ ] **Step 2: Verificare RED**

Run: `node --no-warnings --test tests/request-mappers.test.mjs`

- [ ] **Step 3: Implementare DAL richieste**

`listOwnRequests` richiede `requests:read-own`; non aggiunge un filtro `requester_id` inviato dal client e lascia alla RLS il vincolo di ownership, selezionando comunque solo i campi necessari. Paginare 20 righe.

`getRequestDetail` valida UUID, carica intestazione, righe ed eventi, e restituisce `null` sia per ID inesistente sia per riga invisibile via RLS. Non leggere le descrizioni correnti dal catalogo: usare gli snapshot.

- [ ] **Step 4: Implementare lista e dettaglio**

Le route runtime sono avvolte in `Suspense`; in `[requestId]`, `params` è `Promise<{ requestId: string }>` e viene atteso nel componente dati. La lista mostra data, progressivo, progetto, numero righe e stato. Il dettaglio mostra richiesto, evaso, residuo e cronologia. `created=1` attiva un banner di conferma non persistente.

- [ ] **Step 5: Verificare GREEN**

Run:

```powershell
node --no-warnings --test tests/request-mappers.test.mjs
npx tsc --noEmit
```

- [ ] **Step 6: Committare**

```powershell
git add -- lib/data/requests.ts lib/data/request-mappers.ts components/requests app/(app)/richieste tests/request-mappers.test.mjs
git commit -m "feat: add personal request history"
```

---

### Task 8: Lista Admin ed evasione parziale/completa

**Files:**
- Modify: `lib/data/requests.ts`
- Create: `lib/domain/fulfillment/fulfill-request-line.ts`
- Create: `app/(app)/admin/richieste/actions.ts`
- Create: `app/(app)/admin/richieste/page.tsx`
- Create: `app/(app)/admin/richieste/loading.tsx`
- Create: `components/admin/fulfillment-form.tsx`
- Modify: `components/requests/request-detail.tsx`
- Modify: `app/(app)/richieste/[requestId]/page.tsx`
- Create: `tests/fulfillment-service.test.mjs`

**Interfaces:**
- Produces: `listManagedRequests(filters)` limitata agli Admin.
- Produces: `fulfillRequestLine(input, dependencies?)`.
- Produces: `fulfillRequestLineAction(input): Promise<ActionResult<FulfillmentResult>>`.

- [ ] **Step 1: Scrivere test RED del servizio evasione**

```js
test("calls the fulfillment RPC with a stable idempotency key", async () => {
  const calls = [];
  const result = await fulfillRequestLine(validFulfillment(), {
    callRpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [fulfilledRow()], error: null };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].name, "fulfill_request_line");
  assert.equal(calls[0].args.p_idempotency_key, IDEMPOTENCY_KEY);
});
```

Aggiungere test per quantità zero, errore `FULFILLMENT_EXCEEDS_REMAINING`, accesso negato e risposta RPC vuota.

- [ ] **Step 2: Verificare RED**

Run: `node --no-warnings --test tests/fulfillment-service.test.mjs`

- [ ] **Step 3: Implementare DAL Admin, servizio e action**

`listManagedRequests` chiama `requirePermission("requests:manage")`, applica filtri server-side per stato/testo e pagina 20. Non usa service role: la policy Admin rende visibili tutte le righe.

L'action chiama nuovamente `requirePermission("requests:manage")`, poi la RPC. Al successo:

```ts
revalidatePath("/admin/richieste");
revalidatePath(`/richieste/${result.data.requestId}`);
```

- [ ] **Step 4: Implementare UI Admin**

`/admin/richieste` mostra richiedente, data, progressivo, progetto, righe e stato. Nel dettaglio condiviso, renderizzare `FulfillmentForm` solo per Admin e righe con residuo positivo. Il form:

- parte da `0`;
- imposta `min=1`, `max=residuo`, `step=1`;
- genera l'UUID al primo tentativo e lo conserva durante retry falliti;
- lo rigenera soltanto dopo successo;
- mostra l'esito senza affidarsi al solo colore.

- [ ] **Step 5: Verificare GREEN**

Run:

```powershell
node --no-warnings --test tests/fulfillment-service.test.mjs
npx tsc --noEmit
```

- [ ] **Step 6: Committare**

```powershell
git add -- lib/data/requests.ts lib/domain/fulfillment app/(app)/admin/richieste app/(app)/richieste/[requestId]/page.tsx components/admin components/requests/request-detail.tsx tests/fulfillment-service.test.mjs
git commit -m "feat: add admin request fulfillment"
```

---

### Task 9: Verifica integrata, accessibilità e responsive

**Files:**
- Modify only if failures require scoped fixes in files created by Tasks 1–8.

**Interfaces:**
- Verifies the complete deliverable; produces no new public interface.

- [ ] **Step 1: Eseguire la suite completa**

Run:

```powershell
npm test
npx supabase test db
npx supabase db lint --local --schema public --level warning --fail-on error
npx tsc --noEmit
npm run lint
npm run build
```

Expected: tutti i comandi terminano con exit code `0`, senza errori o warning applicativi introdotti.

- [ ] **Step 2: Avviare l'app con Supabase locale e fixture di test transazionali**

Run: `npm run dev`

Usare utenti distinti User A, User B e Admin creati per il test locale. Verificare tramite browser il percorso reale con cookie Supabase, non soltanto il rendering statico.

- [ ] **Step 3: Verificare il flusso User**

Controllare:

1. login e home;
2. catalogo vuoto senza errori;
3. ricerca e filtri con fixture catalogo;
4. variante illimitata mostrata senza quantità fittizia;
5. intestazione, aggiunta, modifica e rimozione carrello;
6. stampa bozza senza navigazione;
7. invio e redirect al dettaglio;
8. storico che mostra soltanto richieste dello User A;
9. accesso diretto a una richiesta dello User B restituisce not-found/negato.

- [ ] **Step 4: Verificare il flusso Admin**

Controllare:

1. lista globale con richiedente;
2. evasione parziale;
3. retry della stessa chiave senza duplicato;
4. evasione completa e stato aggiornato;
5. assenza di movimenti stock per variante non tracciata;
6. percorso tracciato con inventario e movimenti corretti.

- [ ] **Step 5: Verificare layout e accessibilità**

Controllare a `390×844`, `768×1024` e `1440×900`:

- assenza di scroll orizzontale nei flussi principali;
- touch target almeno 40px;
- focus visibile e ordine tastiera sensato;
- label/errori associati agli input;
- stati comprensibili senza colore;
- tabelle convertite in card su smartphone;
- header/carrello sticky senza coprire i contenuti.

- [ ] **Step 6: Ispezionare il diff finale**

Run:

```powershell
git status --short
git diff --check eeeb498..HEAD
git diff --stat eeeb498..HEAD
```

Verificare che non esistano import CSV, API REST, service role client-side, CRUD Admin fuori scope o modifiche estranee.

- [ ] **Step 7: Committare eventuali sole correzioni di verifica**

Se sono state necessarie correzioni a file già versionati:

```powershell
git add -u
git commit -m "fix: finalize catalog request workflows"
```
