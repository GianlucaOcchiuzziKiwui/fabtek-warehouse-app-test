# CRUD catalogo Admin — Design

## Obiettivo

Fornire agli Admin una gestione semplice e completa di categorie, famiglie, componenti e varianti da un'unica pagina `/admin/catalogo`, senza cambiare il contratto pubblico del catalogo e senza esporre scritture privilegiate al browser.

La UI usa quattro tab, tabelle compatte e popup per creazione, modifica e conferma eliminazione. Fornitori, asset tecnici, giacenze, import e gestione utenti restano fuori ambito.

## Contratto tassonomico invariato

Le relazioni autorevoli restano:

- ogni variante appartiene a un componente;
- ogni componente appartiene a una famiglia;
- ogni variante può appartenere a più categorie tramite `item_variant_categories`;
- categorie e famiglie non hanno una relazione diretta persistita;
- i percorsi categoria → famiglia → componente continuano a essere derivati dalle varianti attive.

Le CRUD Admin non devono reintrodurre `category_families`, viste equivalenti o una seconda fonte di verità.

## Architettura

`app/(app)/admin/catalogo/page.tsx` è un Server Component protetto da `requirePermission("catalog:manage")`. La tab attiva, la ricerca, lo stato e la pagina sono rappresentati nella query string, quindi filtri e navigazione restano condivisibili e non richiedono stato duplicato nel client.

La pagina carica soltanto la collezione della tab attiva e le opzioni minime necessarie al relativo form. Le mutazioni passano da Server Actions che ripetono il controllo `catalog:manage`, validano input sconosciuti e delegano l'accesso dati a un modulo server-only. Il client Supabase della sessione e le RLS Admin-only restano il confine autorizzativo; non vengono aggiunti Route Handler pubblici o service role nel browser.

I popup sono isole client basate sui componenti shadcn/Radix già installati. Il form di ogni entità riusa primitive visive comuni, ma mantiene campi e validazione di dominio specifici.

## Struttura della pagina

La pagina espone quattro URL canonici:

- `/admin/catalogo?tab=categorie`;
- `/admin/catalogo?tab=famiglie`;
- `/admin/catalogo?tab=componenti`;
- `/admin/catalogo?tab=varianti`.

Ogni tab presenta:

- titolo e breve descrizione;
- pulsante primario `Nuovo`;
- ricerca testuale server-side;
- filtro `Attivi`, `Inattivi`, `Tutti`;
- tabella responsive senza scorrimento orizzontale nei flussi principali;
- badge di stato;
- menu o gruppo azioni con `Modifica`, `Attiva/Disattiva`, `Elimina`;
- paginazione server-side per le varianti e per ogni lista che supera il limite configurato.

Su viewport stretti ogni riga diventa una scheda leggibile. I controlli mantengono touch target di almeno 40 px, focus visibile, label esplicite e messaggi di errore associati.

## Campi gestiti

### Categoria

- `code`, obbligatorio e univoco case-insensitive;
- `name`, obbligatorio;
- `subtitle`, facoltativo;
- `icon_key`, selezionato dalla whitelist applicativa;
- `sort_order`, intero;
- `is_active`.

### Famiglia

- `source_code`, facoltativo e univoco quando presente;
- `name`, obbligatorio e univoco case-insensitive;
- `subtitle`, facoltativo;
- `icon_key`, selezionato dalla whitelist applicativa;
- `sort_order`, intero;
- `is_active`.

### Componente

- `family_id`, obbligatorio;
- `name`, obbligatorio e univoco nella famiglia;
- `description`, facoltativo;
- `icon_key`, selezionato dalla whitelist applicativa;
- `sort_order`, intero;
- `is_active`.

### Variante

- `component_id`, obbligatorio;
- `fabtek_code`, obbligatorio e univoco;
- `oracle_sapio_code`, facoltativo e univoco quando presente;
- `description`, obbligatorio;
- `diameter`, facoltativo;
- `material`, obbligatorio;
- `connection`, obbligatorio;
- `unit_of_measure_id`, obbligatorio;
- `category_ids`, almeno una categoria, senza duplicati;
- `track_inventory`;
- `sort_order`, intero;
- `is_active`.

`technical_attributes` non viene esposto in questa UI: alla creazione vale `{}` e in modifica viene conservato. Fornitori, asset e inventario sono esclusi.

## Select delle icone

Categorie, famiglie e componenti usano un select con anteprima Lucide e nome leggibile. I valori ammessi sono esclusivamente quelli in `CATALOG_ICON_KEYS` e nei vincoli database:

`boxes`, `cable`, `circle-dot`, `circle-gauge`, `component`, `cylinder`, `droplets`, `factory`, `flask-conical`, `gauge`, `git-branch`, `package-search`, `plug`, `snowflake`, `sparkles`, `waves`, `wind`, `wrench`.

La mappa icona → componente Lucide viene estratta in un modulo condiviso e riusata sia dalla navigazione pubblica sia dall'Admin. Non vengono salvati SVG o nomi arbitrari.

## Ordinamento

Categorie, famiglie e componenti usano il `sort_order` già presente. La variante riceve un nuovo `sort_order integer not null default 0`; il catalogo ordina prima per `sort_order`, poi per codice Fabtek, mantenendo un risultato deterministico.

Per mantenere il popup semplice, l'ordinamento viene inserito come numero intero. Drag and drop e operazioni di riordino massivo restano fuori ambito.

## Salvataggio e atomicità

Categoria, famiglia e componente sono singole righe e vengono salvate tramite il client Supabase della sessione sotto RLS.

La variante richiede la modifica coordinata di `item_variants` e `item_variant_categories`. Una funzione SQL `save_catalog_variant` Admin-only valida il ruolo, esegue insert/update e sostituisce atomicamente le associazioni categoria. La funzione:

- usa `auth.uid()` e `has_role('admin')`;
- rifiuta array categorie vuoti, nulli o duplicati;
- verifica componente, unità e categorie esistenti;
- normalizza stringhe vuote facoltative a `null`;
- conserva `technical_attributes` in modifica;
- restituisce l'ID della variante;
- revoca l'esecuzione a `PUBLIC`, `anon` e `authenticated`, concedendola a `service_role` e `authenticated` soltanto se il controllo interno Admin resta autorevole. Il client usa il token utente e la funzione rifiuta ogni non Admin.

La migration è forward-only e include test pgTAP. Non viene applicata o pushata a Supabase remoto senza autorizzazione separata.

## Attivazione e visibilità

Attivazione e disattivazione non cascata. Un figlio attivo sotto un padre inattivo resta memorizzato ma non appare nel catalogo pubblico, perché le query pubbliche richiedono l'intera catena attiva. L'Admin vede sempre lo stato proprio e quello del genitore, così una voce non raggiungibile è comprensibile.

Ogni toggle richiede conferma solo quando disattiva una voce. L'attivazione è immediata. Dopo una mutazione riuscita la pagina viene rivalidata e compare un toast.

## Eliminazione

Il popup di eliminazione dichiara esplicitamente l'effetto. L'azione tenta una cancellazione fisica sotto RLS:

- se il record non è referenziato, viene eliminato;
- se PostgreSQL restituisce una violazione FK (`23503`), l'azione risponde con `CATALOG_ENTITY_REFERENCED` e la UI propone `Disattiva`;
- errori diversi non vengono trasformati in falsa riuscita;
- l'eliminazione di una variante può rimuovere le sole associazioni dipendenti con `on delete cascade`, ma resta impedita da richieste, inventario o movimenti con FK restrittive.

Non vengono introdotte cancellazioni cascade applicative, query di preflight soggette a race o service role.

## Validazione ed errori

Gli input entrano nel dominio come `unknown`. La validazione applicativa controlla UUID, stringhe normalizzate, limiti coerenti con lo schema, icone, interi, booleani e categorie uniche. I messaggi pubblici sono stabili e in italiano.

Gli errori attesi comprendono:

- dati non validi;
- codice o nome duplicato;
- relazione non valida;
- entità non trovata o non visibile;
- entità referenziata e quindi non eliminabile;
- accesso negato;
- errore infrastrutturale generico.

Dettagli SQL, payload, stack e credenziali non vengono esposti. Le azioni usano `ActionResult` e rivalidano `/admin/catalogo` e `/catalogo` soltanto dopo una mutazione riuscita.

## Navigazione

Per gli Admin viene aggiunta una voce `Gestisci catalogo` accanto a `Gestisci richieste`. La route applica comunque il controllo server-side: nascondere il link agli User non è un controllo autorizzativo.

## Strategia di test

Lo sviluppo segue TDD con test per:

- parsing e normalizzazione di tutti i form;
- whitelist delle icone e condivisione della relativa mappa;
- mapping rigoroso delle quattro liste Admin;
- filtri, ricerca e paginazione;
- permission check delle Server Actions;
- error mapping Supabase, duplicati e FK referenziate;
- salvataggio atomico variante e sostituzione categorie;
- impossibilità per uno User di eseguire la RPC;
- mancata reintroduzione di `category_families`;
- stati, label, focus e struttura accessibile dei dialog;
- aggiornamento del catalogo pubblico e ordinamento deterministico.

La verifica finale comprende suite completa, ESLint, typecheck, build Next.js, pgTAP locale se Docker è disponibile e controllo browser responsive con sessione Admin locale. Nessun deploy, push Supabase o import catalogo è incluso.

## Criteri di accettazione

1. Un Admin gestisce le quattro entità da una sola pagina a tab.
2. Uno User non può aprire la pagina né completare una mutazione chiamando direttamente una Server Action o la RPC.
3. Crea e modifica avvengono in popup con errori associati ai campi.
4. Categoria, famiglia e componente includono il select icone con anteprima e whitelist condivisa.
5. La variante gestisce tutti i campi concordati e almeno una categoria.
6. Il salvataggio variante e categorie è atomico.
7. Ricerca, stato e paginazione sono server-side e persistono nell'URL.
8. L'eliminazione fisica riesce solo per dati non referenziati; altrimenti viene proposta la disattivazione.
9. Le voci inattive restano visibili nell'Admin e spariscono dai percorsi pubblici secondo il contratto esistente.
10. Il catalogo continua a derivare famiglia e componente dagli item, senza `category_families`.
11. UI e popup sono usabili da tastiera, responsive e privi di scroll orizzontale nei flussi principali.
12. Test, lint, typecheck e build passano; ogni limite ambientale è dichiarato.
