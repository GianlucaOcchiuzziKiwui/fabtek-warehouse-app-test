# Fabtek Materiali — Product Context

> Documento operativo per Codex. Definisce ambito funzionale, vincoli, regole di business, architettura tecnica, decisioni confermate e punti ancora aperti. In caso di conflitto, le **Regole di business non negoziabili** e la **priorità delle informazioni** prevalgono sui dettagli del prototipo HTML.

## 1. Sintesi del prodotto

Fabtek Materiali è una web app interna, semplice e responsive, pensata per centralizzare le richieste di materiali provenienti dal campo/cantiere.

L'app deve permettere a un richiedente di:

1. consultare il catalogo e la disponibilità dei materiali;
2. creare una richiesta composta da uno o più articoli;
3. seguire lo stato e le consegne della richiesta.

Un amministratore di magazzino deve inoltre poter:

1. gestire il catalogo;
2. vedere le richieste di tutti gli utenti;
3. registrare evasioni parziali o complete, articolo per articolo;
4. archiviare o eliminare richieste completate.

Il prodotto deve essere raggiungibile via browser da desktop, tablet e smartphone. L'interfaccia deve privilegiare tablet e utilizzo sul campo: pochi passaggi, controlli grandi, navigazione guidata e informazioni essenziali sempre visibili.

Usare il file `mock.html` come riferimento per nomenclatura, funzionalità, layout e logiche non esplicitate. Il prototipo non è codice di produzione né una fonte dati.

## 2. Obiettivi

- Eliminare richieste di materiale disperse tra email, messaggi e procedure manuali.
- Rendere univoco il catalogo dal quale è possibile richiedere materiali.
- Mostrare dati tecnici, datasheet e disponibilità durante la selezione.
- Consentire richieste multi-articolo con un flusso simile a un carrello.
- Dare al richiedente visibilità sull'avanzamento di ogni singola riga.
- Permettere al magazzino di registrare più consegne parziali nel tempo.
- Generare documenti PDF ed email automatiche coerenti e tracciabili.

## 3. Non obiettivi dell'MVP

- Non è un ERP completo.
- Non gestisce acquisti, prezzi, ordini a fornitore, fatture o contabilità; conserva soltanto i riferimenti tecnici del fornitore presenti nel catalogo.
- Non deve introdurre un sistema autonomo di logistica avanzata.
- Non deve permettere la richiesta di articoli non presenti nel catalogo.
- Non deve esporre funzioni senza autenticazione.
- Non deve sostituire automaticamente il sistema di magazzino esistente finché l'integrazione non è definita e validata.

## 4. Utenti e autorizzazioni

### 4.1 User / Richiedente

Può:

- autenticarsi con email e password tramite Supabase Auth;
- consultare catalogo, dati tecnici, datasheet e disponibilità;
- creare e inviare richieste;
- vedere esclusivamente le proprie richieste;
- consultare quantità richieste, quantità consegnate, date dei rilasci e stato.

Non può:

- modificare il catalogo;
- vedere richieste di altri utenti;
- registrare evasioni;
- scegliere o modificare il proprio ruolo.

### 4.2 Admin / Magazzino

Eredita le funzioni dello User e può inoltre:

- vedere tutte le richieste;
- registrare evasioni parziali o complete per singola riga;
- gestire categorie, famiglie, componenti e varianti;
- archiviare o eliminare richieste completate.

Le autorizzazioni devono essere applicate lato server/database, non soltanto nascondendo elementi nell'interfaccia.

## 5. Navigazione principale

Dopo il login, la home mostra soltanto tre azioni:

1. **Crea richiesta materiale**
2. **Cerca info materiali**
3. **Controlla le tue richieste**; per Admin: **Gestisci le richieste**

L'interfaccia deve mantenere visibili nome utente, ruolo e logout. Durante la creazione di una richiesta deve mostrare anche il numero di righe nel carrello e l'accesso al riepilogo.

## 6. Flusso: crea richiesta materiale

### 6.1 Intestazione richiesta

Prima di scegliere gli articoli, l'utente compila:

| Campo | Obbligatorio | Regola |
|---|---:|---|
| Richiedente | Sì | Deriva dall'utente autenticato e non è liberamente modificabile |
| Data richiesta | Sì | Assegnata dal server al momento dell'invio; il client può mostrarne un'anteprima |
| Progetto # | Sì | Identificativo commessa/progetto |
| Tool / Line # | Sì | Riferimento macchina o linea |
| Utilities | Sì | Testo libero inserito dall'utente; non è collegato alla categoria del catalogo |
| Materiale | Automatico | Deriva dalle varianti selezionate, se utile nel riepilogo |
| Categoria | Automatico | Deriva dalla selezione del catalogo e può differire tra le righe |
| Altro | No | Note libere |

`Utilities` e `Categoria` sono informazioni distinte: `Utilities` descrive liberamente l'utility o il riferimento operativo indicato dal richiedente; `Categoria` classifica l'articolo nel catalogo. Una richiesta può quindi contenere righe appartenenti a categorie diverse.

Il passaggio successivo resta disabilitato finché tutti i campi obbligatori non sono validi. La validazione viene ripetuta lato server; data richiesta e richiedente non sono accettati dal client come valori autorevoli.

### 6.2 Selezione guidata

Il catalogo presenta questo imbuto all'utente:

`Categoria → Famiglia → Componente → Variante/misura`

L'imbuto è una modalità di navigazione, non una catena di appartenenza uno-a-molti: una stessa variante può essere compatibile con più categorie/utilità di impianto. La categoria selezionata deve quindi filtrare le varianti tramite un'associazione molti-a-molti, mentre famiglia e componente descrivono la tassonomia tecnica del prodotto.

La ricerca è separata dall'imbuto e restituisce soltanto corrispondenze di categoria, famiglia o componente. Ogni corrispondenza espone il percorso tassonomico completo e, una volta selezionata, riporta l'utente nel relativo punto dell'imbuto. Senza ricerca la pagina mostra inizialmente solo le categorie; gli item vengono caricati esclusivamente dopo la scelta del componente.

Categorie iniziali da importare e successivamente rendere amministrabili tramite tabelle relazionali:

- PV — Process Vacuum
- Standard Gas (<25ra)
- UHP Gases (<10ra)
- Special Coax Gases (Coaxial)
- PCW — Process Cooling Water
- SW — Soft Water
- Exhaust
- DIW — UHP Water
- DRAIN — Waste
- Chemicals
- VDM — Vuoto di Macchina
- LIM
- Clean Room
- Other Generals

Famiglie canoniche iniziali, ottenute unendo i requisiti funzionali con i valori effettivi del CSV:

- Tubo
- Fitting
- Valvole
- Riduttori di pressione
- Flessibili
- Instrument
- Raccordi
- Guarnizioni
- Accessori
- Altro

Categorie e famiglie iniziali sono seed data, non enum rigidi nel codice: l'Admin deve poterle gestire. L'associazione tra categoria e famiglia deve essere rappresentata esplicitamente nel database. I codici presenti nelle fonti di importazione sono alias esterni e non devono essere confusi con il testo libero `Utilities` della richiesta.

### 6.3 Dettaglio variante

Ogni variante selezionabile deve mostrare almeno:

- Part # / codice Fabtek;
- eventuale codice Oracle SAPIO;
- componente;
- misura o diametro;
- materiale;
- tipo di connessione;
- unità di misura;
- produttore/fornitore e relativo codice articolo, quando disponibili;
- eventuali altre caratteristiche tecniche;
- disponibilità effettiva a magazzino, solo se `track_inventory = true`;
- stato visivo della disponibilità: `unlimited` se `track_inventory = false`; altrimenti disponibile, scorta bassa o esaurito;
- collegamento al datasheet del produttore;
- quantità richiesta.

La quantità parte sempre da `0` e deve essere un intero positivo. Se `track_inventory = true`, non può superare la disponibilità effettiva e un articolo esaurito resta consultabile ma non può essere aggiunto alla richiesta; se è `false`, la variante è autorevolmente `unlimited` e non richiede una riga inventario.

### 6.4 Carrello e riepilogo

- Una richiesta può contenere più articoli e varianti, anche appartenenti a categorie diverse.
- Dopo ogni aggiunta l'utente può continuare a sfogliare oppure aprire il riepilogo.
- La stessa variante compare al massimo una volta nel carrello; aggiunte successive aggiornano la quantità.
- Nel riepilogo può modificare le quantità e rimuovere le righe prima dell'invio.
- Dal riepilogo può generare o stampare una distinta PDF in stato di bozza prima dell'invio.
- Il carrello non prenota la merce. L'invio crea richiesta e righe, congela `track_inventory` in `material_request_lines.snapshot_track_inventory`, assegna il progressivo e prenota in un'unica transazione soltanto le quantità delle varianti tracciate nello snapshot.
- Se una quantità di una variante tracciata non è più disponibile, l'intera operazione fallisce senza creare una richiesta parziale e il client indica le righe da correggere.
- Un `client_request_id` UUID, univoco per richiedente, rende l'invio idempotente e impedisce duplicati causati da doppio clic o retry di rete.
- Browser e server legano la chiave al payload normalizzato completo: la bozza e un tentativo ambiguo sono salvati insieme in `localStorage` sotto l'UUID del profilo autenticato, il retry riusa gli stessi dati e un payload differente con la stessa chiave viene rifiutato indicando lo storico richieste. Dopo aver verificato lo storico, solo un'azione esplicita e avvertita può conservare i contenuti della bozza generando una nuova chiave.
- La richiesta creata ha stato iniziale `IN_PREPARAZIONE`.
- Dopo l'invio, la richiesta non deve essere modificabile dal richiedente.

### 6.5 PDF bozza, richiesta confermata ed email

Il file `mock pdf richiesta user.pdf` definisce i dati e la struttura visiva della distinta pre-invio. I valori presenti nel mock sono esempi, non dati di produzione.

La distinta contiene:

**Intestazione**

- marchio Fabtek;
- titolo **Distinta richiesta materiale — bozza**;
- richiedente;
- data richiesta;
- Progetto #;
- Tool / Line #;
- Utilities;
- note.

**Tabella articoli**

- Part #;
- Categoria;
- Famiglia;
- Articolo/Componente;
- Misura;
- Materiale;
- Connessione;
- Quantità.

La bozza deve riportare chiaramente: **Documento non ancora confermato al magazzino**. Non possiede progressivo, non prenota la disponibilità, non viene inviata via email e non viene conservata come documento ufficiale. Può essere prodotta lato client tramite una vista di stampa dedicata o lato server, purché usi soltanto i dati correnti del riepilogo.

Dopo il commit, il sistema accoda invece il PDF ufficiale della richiesta confermata. Questo documento usa lo stesso nucleo di dati della bozza, aggiunge almeno progressivo, data effettiva di invio e stato, ed è generato dagli snapshot persistiti. Viene salvato in storage privato e inviato tramite Resend ai destinatari configurati nell'ambiente.

Oggetto email:

`CMKT_RDM_{Tool/Line#}_{Utilities}_{Richiedente}_{Progressivo}`

Il progressivo deve essere assegnato atomicamente dal database e garantire un identificativo univoco della richiesta. I valori usati nell'oggetto devono essere normalizzati. Un errore di generazione PDF o di invio email non annulla la richiesta: il job rimane tracciato e può essere ritentato senza duplicare l'invio.

### 6.6 Dati di esempio del PDF mock

Questa fixture serve per testare il template e non deve essere importata come seed di produzione:

| Campo | Valore di esempio |
|---|---|
| Richiedente | Marco Rossi |
| Data | 21/08/2026 |
| Progetto # | 444 |
| Tool / Line # | 55 |
| Utilities | 85 |
| Note | 8 |
| Part # | VAL-685 |
| Categoria | Standard Gas |
| Famiglia | Valvole |
| Articolo | Item 10 |
| Misura | 1\" |
| Materiale | PVDF |
| Connessione | Flangiato |
| Quantità | 13 |

Data/ora di stampa, titolo del browser, URL locale `file:///.../mock.html` e numerazione `1/1` visibili ai margini sono intestazioni e piè di pagina aggiunti dal browser: non fanno parte del template applicativo di produzione.

## 7. Flusso: cerca info materiali

È un percorso di sola consultazione e riusa lo stesso catalogo a imbuto.

Deve permettere:

- navigazione per categoria, famiglia, componente e variante;
- ricerca testuale per codice o descrizione;
- visualizzazione delle caratteristiche tecniche;
- visualizzazione della disponibilità;
- apertura/download del datasheet.

Non richiede i dati di intestazione di una richiesta e non mostra quantità o carrello finché l'utente non sceglie esplicitamente **Richiedi questo articolo**. Da quel momento avvia il normale flusso di richiesta mantenendo l'articolo selezionato.

## 8. Flusso: controllo e gestione richieste

### 8.1 Vista User

Mostra soltanto le richieste create dall'utente autenticato, ordinate dalla più recente.

Campi minimi dell'elenco:

- data richiesta;
- progressivo/numero richiesta;
- Progetto #;
- numero di righe/articoli;
- stato.

Il dettaglio è in sola lettura e mostra, per ogni riga:

- quantità richiesta;
- quantità complessivamente consegnata;
- quantità residua;
- stato riga;
- cronologia dei rilasci con quantità e data.

### 8.2 Vista Admin

Mostra le richieste di tutti gli utenti e aggiunge il richiedente nell'elenco.

Nel dettaglio, l'Admin può registrare una nuova evasione per una singola riga. La quantità inserita:

- parte da `0`;
- deve essere maggiore di `0`;
- non può superare la quantità residua;
- si somma alle evasioni precedenti;
- produce un evento storico separato con data, quantità e operatore.

Una riga non deve conservare soltanto il totale evaso: serve la cronologia delle singole consegne.

La validazione del residuo, la registrazione dell'evento e l'aggiornamento della giacenza devono avvenire nella stessa transazione database. Una `idempotency_key` univoca impedisce che un retry registri due volte la stessa evasione.

## 9. Stati e regole di calcolo

Stati di riga e richiesta:

| Stato | Condizione |
|---|---|
| `IN_PREPARAZIONE` | Quantità evasa = 0 |
| `EVASA_PARZIALE` | Quantità evasa > 0 e < quantità richiesta |
| `EVASA` | Quantità evasa = quantità richiesta |

Lo stato della richiesta è derivato dalle righe:

- `IN_PREPARAZIONE` se nessuna riga ha quantità evasa;
- `EVASA` se tutte le righe sono completamente evase;
- `EVASA_PARZIALE` in tutti gli altri casi in cui esiste almeno un'evasione.

Gli stati non devono essere impostati manualmente se possono essere calcolati dai dati di evasione.

L'archiviazione non è uno stato di evasione: va rappresentata separatamente con `archived_at` e `archived_by`.

### 9.1 Disponibilità, prenotazioni e movimenti

La modalità inventario è un dato autorevole della variante: `track_inventory = false` significa disponibilità illimitata e non è un bypass deciso dal client. Al momento dell'invio viene copiata in `material_request_lines.snapshot_track_inventory`: eventuali modifiche successive della variante valgono soltanto per nuove richieste e non possono creare o perdere prenotazioni storiche. Solo per una riga tracciata nello snapshot si distinguono:

- `on_hand_quantity`: quantità fisicamente presente;
- `reserved_quantity`: quantità impegnata da richieste non ancora evase;
- `available_quantity`: valore derivato `on_hand_quantity - reserved_quantity`.

Regole:

1. l'invio incrementa `reserved_quantity` solo per varianti tracciate e solo se la disponibilità effettiva è sufficiente per tutte le rispettive righe;
2. l'evasione di una riga con snapshot tracciato decrementa `reserved_quantity` e `on_hand_quantity` della stessa quantità; quella con snapshot non tracciato conserva evento e stati senza mutare l'inventario, anche se il flag corrente della variante è cambiato;
3. ogni variazione di inventario crea un movimento immutabile con causale, quantità, operatore, timestamp e riferimento alla richiesta;
4. `on_hand_quantity` e `reserved_quantity` non possono diventare negative e il prenotato non può superare la giacenza;
5. la soglia di scorta bassa è configurabile solo per una variante tracciata;
6. una futura cancellazione o riduzione di richieste non evase dovrà liberare la prenotazione nella stessa transazione, solo quando esiste una prenotazione;
7. `get_catalog_availability()` espone `track_inventory`, `available_quantity`, soglia e stato: per una variante non tracciata restituisce `available_quantity = null` e `stock_status = unlimited`, senza quantità fittizie.

## 10. Chiusura, report finale, archiviazione ed eliminazione

Quando tutte le righe sono evase, nella stessa transazione che registra l'ultima evasione:

1. la richiesta passa automaticamente a `EVASA`;
2. viene accodato una sola volta un report PDF finale;
3. per ogni riga il report mostra quantità richiesta, quantità consegnata e date delle consegne;
4. il report viene inviato ai destinatari configurati.

Oggetto email finale:

`CMKT_RDM_{Tool/Line#}_{Utilities}_{Richiedente}_{Progressivo}_EVASA`

Dopo il completamento, l'Admin può archiviare la richiesta oppure eliminarla definitivamente. L'eliminazione definitiva:

- è consentita solo per richieste `EVASA`;
- richiede una conferma esplicita che dichiari l'operazione non recuperabile;
- viene eseguita lato server in una transazione;
- rimuove i dati dipendenti e i documenti dallo storage;
- lascia un evento di audit minimale con identificativo, progressivo, operatore e timestamp, senza conservare il contenuto eliminato.

## 11. Catalogo

Entità minime:

- Categoria
- alias/codici categoria delle sorgenti esterne
- Famiglia
- associazione Categoria-Famiglia
- Componente
- Variante/articolo
- associazione Variante-Categoria
- riferimenti fornitore
- asset tecnici: foto, datasheet, vista 3D e specifica
- Inventario e movimenti
- import catalogo e relativi errori

L'Admin può creare, modificare, ordinare, attivare e disattivare categorie, famiglie, componenti e varianti. L'eliminazione fisica di una voce già referenziata da richieste o movimenti non è consentita: in quel caso deve essere disattivata.

Le richieste possono contenere esclusivamente varianti presenti e attive nel catalogo. Le righe già inviate devono conservare uno snapshot dei dati descrittivi essenziali, così successive modifiche al catalogo non alterano lo storico.

### 11.1 Fonte iniziale `Caricamento Materiali.csv`

Il file è la fonte iniziale delle varianti, non delle giacenze. Contiene 236 righe prodotto e 24 colonne. Tutti i codici Fabtek e Oracle SAPIO sono valorizzati e univoci nel file.

Mappatura di importazione:

| Colonna CSV | Destinazione | Regola |
|---|---|---|
| `FAMIGLIA` | `families.source_code` / `families.name` | normalizzare spazi e maiuscole senza perdere il valore originale |
| `ITEM` | `components.name` | trim obbligatorio; identifica il componente dentro la famiglia |
| `FABTEK CODE` | `item_variants.fabtek_code` | obbligatorio, univoco case-insensitive; è il Part # applicativo |
| `Codice Oracle SAPIO` | `item_variants.oracle_sapio_code` | obbligatorio per questo import, univoco case-insensitive |
| `DIAMETRO` | `item_variants.diameter` | nullable: 5 flowmeter non lo valorizzano |
| `MATERIALE` | `item_variants.material` | trim e normalizzazione controllata |
| `CONNESSIONE` | `item_variants.connection` | valore tecnico ricercabile |
| `ARTICOLO (DESCIRZIONE)` | `item_variants.description` | correggere soltanto il nome dell'intestazione, non alterare automaticamente i contenuti |
| `Unità Di Misura` | `units_of_measure` + FK sulla variante | `M` e `Metri` confluiscono nel codice canonico `m`; `Pcs` in `pcs` |
| `FORNITORE` | `suppliers.name` | nullable; è un riferimento catalogo, non abilita la gestione acquisti |
| `Codice Fornitore` | `item_variant_suppliers.supplier_part_number` | `nd` diventa `null`; non è globalmente univoco |
| `FOTO` | `product_assets` tipo `photo` | `#VALUE!` è un errore sorgente e non viene importato come URL |
| `Link Datasheet` | `product_assets` tipo `datasheet` | nullable |
| `Link 3D View` | `product_assets` tipo `three_d_view` | nullable |
| `LINK SPEC` | `product_assets` tipo `specification` | nullable |
| `UPW` … `EXHAUST` | `item_variant_categories` | ogni `X` crea un'associazione; una riga può crearne più di una |

Mappatura dei codici categoria esterni:

| Codice CSV | Categoria canonica |
|---|---|
| `UPW` | possibile alias di `DIW — UHP Water`, da confermare prima della pubblicazione dell'import |
| `SW` | `SW — Soft Water` |
| `PV` | `PV — Process Vacuum` |
| `GAS NON UHP` | `Standard Gas (<25ra)` |
| `GAS UHP` | `UHP Gases (<10ra)` |
| `VDM` | `VDM — Vuoto di Macchina` |
| `PCW` | `PCW — Process Cooling Water` |
| `DRAIN` | `DRAIN — Waste` |
| `EXHAUST` | `Exhaust` |

Nel file attuale sono valorizzati soltanto `UPW`, `SW`, `PV` e `DRAIN`; le altre cinque colonne sono vuote. Le categorie `Special Coax Gases`, `Chemicals`, `LIM`, `Clean Room` e `Other Generals` non hanno una colonna dedicata nel CSV e restano categorie canoniche senza varianti importate finché non viene fornita una mappatura.

Il file contiene sei famiglie sorgente: `FITTING`, `FLESSIBILI`, `INSTRUMENT`, `PRESSURE REGULATOR`, `TUBO` e `VALVE`. `PRESSURE REGULATOR`, `TUBO` e `VALVE` possono essere presentate rispettivamente come Riduttori di pressione, Tubo e Valvole; `FLESSIBILI` e `INSTRUMENT` sono famiglie aggiuntive rispetto all'elenco iniziale. Non vanno forzate dentro `Accessori` o `Altro`.

Qualità dati rilevata e regole conseguenti:

- 175 varianti su 236 appartengono a più categorie; l'associazione categoria-variante è quindi obbligatoriamente molti-a-molti;
- `ITEM` e `MATERIALE` contengono almeno un duplicato dovuto a spazi finali: il confronto avviene sul valore normalizzato;
- `FOTO` contiene 104 valori `#VALUE!` e 132 valori vuoti: nessuna foto valida è disponibile dal file;
- i tre campi link sono interamente vuoti nel file corrente;
- il fornitore manca su 25 righe; il codice fornitore è presente ma comprende 26 valori `nd` e altri duplicati leciti;
- le unità sono `Pcs` per 216 righe, `M` per 13 e `Metri` per 7;
- il CSV non contiene quantità disponibili, soglie o movimenti: l'inventario deve essere caricato da una fonte separata e non inizializzato con disponibilità fittizie.

L'import deve essere ripetibile e transazionale: prima valida tutte le righe in staging, poi esegue upsert per codici esterni normalizzati e sostituisce le sole associazioni provenienti dalla stessa fonte. Errori di riga, valori scartati e conteggi vengono registrati nel batch; un errore bloccante impedisce la pubblicazione dell'intero batch.

## 12. Modello dati di riferimento

I nomi sono indicativi, mentre responsabilità, relazioni e vincoli sono obbligatori. Tutte le tabelle operative includono `created_at` e, quando modificabili, `updated_at`, usando `timestamptz`.

### Profile

- `id uuid`, PK e FK verso `auth.users.id`
- `full_name text not null`
- `role app_role not null default 'USER'`
- `is_active boolean not null default true`

`app_role` contiene soltanto `USER` e `ADMIN`. Il ruolo Supabase `authenticated` non deve essere riutilizzato come ruolo applicativo.

### Category

- `id uuid`
- `code text`
- `name text`
- `subtitle text null`
- `image_asset_id uuid null`
- `sort_order integer`
- `is_active boolean`

`code` deve essere univoco senza distinzione tra maiuscole e minuscole.

### CategoryExternalCode

- `category_id uuid`
- `source_system text`
- `external_code text`

La coppia (`source_system`, `external_code`) è univoca case-insensitive. La risoluzione di un alias verso una categoria canonica deve essere esplicita: finché non viene confermata l'equivalenza fra `UPW` e `DIW — UHP Water`, il batch può essere validato ma non pubblicato.

### Family

- `id uuid`
- `source_code text null`
- `name text`
- `subtitle text null`
- `image_asset_id uuid null`
- `sort_order integer`
- `is_active boolean`

La relazione molti-a-molti tra categorie e famiglie è rappresentata da `CategoryFamily`, con chiave composta (`category_id`, `family_id`).

### Component

- `id uuid`
- `family_id uuid`
- `name text`
- `description text null`
- `sort_order integer`
- `is_active boolean`

Il componente appartiene a una famiglia ma non a una sola categoria. La categoria viene associata alla variante, perché nel CSV varianti dello stesso componente hanno combinazioni di categoria differenti.

### ItemVariant

- `id uuid`
- `component_id uuid`
- `fabtek_code text`
- `oracle_sapio_code text null`
- `description text`
- `diameter text null`
- `material text`
- `connection text`
- `unit_of_measure_id uuid`
- `technical_attributes jsonb not null default '{}'`
- `is_active boolean`

`fabtek_code` e, quando presente, `oracle_sapio_code` sono univoci senza distinzione tra maiuscole e minuscole. Il Part # mostrato dall'app è `fabtek_code`. Gli attributi usati per ricerca, ordinamento, PDF o vincoli sono colonne esplicite e non vengono nascosti in `technical_attributes`.

### ItemVariantCategory

- `item_variant_id uuid`
- `category_id uuid`
- `source_system text null`

La coppia (`item_variant_id`, `category_id`) è univoca. Un vincolo applicativo/database verifica che la famiglia del componente sia abilitata nella corrispondente `CategoryFamily`.

### UnitOfMeasure

- `id uuid`
- `code text` univoco, per esempio `pcs` o `m`
- `name text`
- `allows_fraction boolean`

Le quantità delle richieste restano intere nell'MVP anche per l'unità `m`, come già stabilito. Se in futuro serviranno metri frazionari, la modifica deve coinvolgere insieme inventario, richieste, evasioni e PDF.

### Supplier e ItemVariantSupplier

`Supplier` contiene `id`, `name` e `is_active`. `ItemVariantSupplier` contiene `item_variant_id`, `supplier_id`, `supplier_part_number null` e `is_preferred`. Il codice fornitore non è globalmente univoco e `nd` non è un codice valido. Queste tabelle espongono riferimenti tecnici del catalogo senza introdurre ordini, prezzi o gestione acquisti.

### ProductAsset

- `id uuid`
- `item_variant_id uuid`
- `kind`: `photo | datasheet | three_d_view | specification`
- `storage_path text null`
- `external_url text null`
- `title text null`
- `sort_order integer`
- `is_active boolean`

Esattamente uno tra `storage_path` ed `external_url` deve essere valorizzato. Gli URL vengono validati e i valori Excel di errore come `#VALUE!` vengono registrati come issue di import, non come asset.

### CatalogImport e CatalogImportIssue

`CatalogImport` registra sorgente, nome file, hash, stato, attore, timestamp e conteggi di righe lette, valide, inserite, aggiornate e scartate. `CatalogImportIssue` registra batch, numero riga, codice Fabtek quando disponibile, campo, severità, codice errore e messaggio. Il file originale può essere conservato in storage privato secondo la retention concordata.

### Inventory

- item_variant_id
- `on_hand_quantity`, intero non negativo
- `reserved_quantity`, intero non negativo e non superiore a `on_hand_quantity`
- `low_stock_threshold`, intero non negativo
- `updated_at`

`available_quantity` è derivata e non viene aggiornata liberamente.

### InventoryMovement

- id
- item_variant_id
- request_id e request_line_id, nullable secondo causale
- tipo movimento
- quantità
- operatore
- timestamp server
- eventuali note

### MaterialRequest

- id
- progressivo univoco assegnato dal database
- `client_request_id` UUID
- requester_id
- data_richiesta assegnata dal server
- progetto
- tool_line
- utilities
- note
- inviato_il
- archiviato_il
- archiviato_da

La coppia (`requester_id`, `client_request_id`) è univoca. `Utilities` è testo libero e non è una FK verso `Category`. Lo stato è derivato dalle righe; se materializzato per prestazioni, può essere aggiornato soltanto da funzione o trigger database e deve essere coperto da test.

### MaterialRequestLine

- id
- request_id
- item_variant_id
- selected_category_id
- snapshot_part_number
- snapshot codice Oracle, categoria selezionata, famiglia, descrizione, diametro, materiale, connessione e unità di misura
- posizione immutabile della riga nel payload normalizzato
- quantita_richiesta
- quantita_evasa derivabile dalla somma degli eventi

La coppia (`request_id`, `item_variant_id`) è univoca e `quantita_richiesta` è un intero positivo. `selected_category_id` deve essere una categoria attiva associata alla variante al momento dell'invio e viene congelata anche nello snapshot.

### FulfillmentEvent

- id
- request_line_id
- quantita
- data_evasione
- admin_id
- eventuali note
- `idempotency_key` UUID univoca

### GeneratedDocument

- richiesta associata
- tipo: `INITIAL_REQUEST | FINAL_REPORT`
- percorso storage e hash del contenuto
- stato: `PENDING | PROCESSING | COMPLETED | FAILED`
- numero tentativi, prossimo tentativo ed eventuale errore
- timestamp di creazione e completamento
- vincolo univoco (`request_id`, `document_type`)

La distinta in bozza non è un `GeneratedDocument`: non esiste ancora una richiesta persistita e non deve essere trattata come documento ufficiale.

### NotificationJob

- richiesta e documento associati
- tipo: `INITIAL_REQUEST | FINAL_REPORT`
- destinatari e oggetto risolti al momento dell'accodamento
- stato, tentativi, prossimo tentativo, errore e data invio
- identificativo messaggio restituito da Resend
- chiave di idempotenza univoca per richiesta e tipo

### AuditEvent

- attore, azione, tipo e identificativo risorsa
- timestamp server
- metadati essenziali senza segreti
- record append-only, non modificabile dagli utenti applicativi

### 12.1 Operazioni transazionali obbligatorie

Le operazioni concorrenti devono essere implementate come funzioni PostgreSQL/RPC transazionali richiamate dal server Next.js.

**Invio richiesta**

1. verifica utente attivo, payload e varianti;
2. serializza per richiedente e `client_request_id`, quindi restituisce l'eventuale richiesta già creata solo se intestazione e righe ordinate coincidono con il payload normalizzato;
3. blocca in ordine stabile varianti e righe inventario con `track_inventory = true` e ricontrolla compatibilità e disponibilità;
4. assegna il progressivo tramite contatore database;
5. crea richiesta e snapshot delle righe, inclusa la modalità inventario;
6. incrementa le prenotazioni e registra i movimenti soltanto per le righe tracciate;
7. accoda documento iniziale e notifica;
8. esegue commit oppure rollback completo.

**Evasione riga**

1. verifica ruolo Admin e chiave di idempotenza;
2. blocca prima la richiesta padre, poi la riga e, soltanto per righe tracciate nello snapshot, l'inventario;
3. calcola il residuo dagli eventi registrati;
4. rifiuta quantità non valida o superiore al residuo;
5. registra sempre l'evasione e il movimento inventario soltanto per una variante tracciata;
6. aggiorna prenotato e giacenza soltanto per una riga tracciata nello snapshot;
7. se la richiesta diventa completamente evasa, accoda una sola volta report e notifica finale;
8. esegue commit oppure rollback completo.

Il client non deve concatenare più scritture per simulare queste transazioni.

## 13. Regole di business non negoziabili

- Ogni accesso richiede autenticazione e un profilo attivo.
- Il ruolo deriva dal profilo utente e non è selezionabile dal client.
- Uno User vede solo dati e richieste di propria competenza.
- Una richiesta contiene solo varianti attive del catalogo.
- La quantità richiesta deve essere un intero positivo e non può superare la disponibilità per una variante con `track_inventory = true`; una variante non tracciata è autorevolmente illimitata.
- L'invio prenota tutte le righe tracciate oppure non crea nulla; il client non può selezionare o aggirare questa modalità.
- Una nuova evasione non può eccedere il residuo.
- Ogni evasione conserva data e operatore; conserva anche un movimento inventario se e solo se la variante è tracciata.
- Gli stati sono calcolati, non liberamente editabili.
- Il progressivo e i nomi dei documenti sono generati lato server/database.
- Invio email e generazione PDF sono tracciati, idempotenti e ritentabili.
- Una modifica del catalogo non deve cambiare retroattivamente richieste e PDF storici.
- Nessuna chiave privilegiata o URL permanente di un file privato viene esposto al browser.

## 14. UX e stile visivo

- Layout responsive e touch-friendly.
- Home minimale con tre sole azioni.
- Navigazione per grandi riquadri visivi.
- Breadcrumb e pulsante “Continua a sfogliare” nei livelli interni.
- Riepilogo/carrello sempre raggiungibile durante la selezione.
- Disponibilità sempre visibile nel dettaglio articolo.
- Feedback chiari per scorta bassa, esaurito, errori e operazioni riuscite.
- Conferma prima di operazioni distruttive.
- Stati leggibili tramite testo e non soltanto colore.

Riferimenti grafici emersi dai materiali:

- navy Fabtek `#0B2545` come colore principale;
- azzurro chiaro `#D9E8F7` per superfici o righe alternate;
- bianco `#FFFFFF` e grigio `#F2F2F2` per fondi;
- prototipo più recente: accento rame `#B8752B`, font Oswald per titoli e IBM Plex Sans per testo.

Il prototipo HTML è un riferimento di flusso e direzione visiva, non codice di produzione né fonte dati.

## 15. Requisiti tecnici trasversali

### 15.1 Stack confermato

- Next.js 16 con App Router e TypeScript;
- React 19;
- Supabase Auth per autenticazione;
- Supabase Postgres per dati, vincoli, funzioni transazionali e RLS;
- Supabase Storage con bucket privati per datasheet e PDF;
- Resend per email;
- libreria PDF eseguita nel runtime Node.js di Next.js;
- Tailwind CSS e componenti shadcn/ui per l'interfaccia.

Il repository installa attualmente Next.js `16.3.2` e React `19.2.8`. Prima dello sviluppo funzionale, le dipendenze dichiarate come `latest` devono essere fissate a versioni riproducibili e `eslint-config-next` deve essere allineato alla major di Next.js; nel repository è ancora `15.3.1`.

### 15.2 Confini applicativi

- I Server Components leggono direttamente da Supabase tramite il client server, senza chiamare Route Handler interni.
- Le mutazioni originate dalla UI usano Server Actions o Route Handler sottili, con validazione, controllo sessione e autorizzazione.
- I Route Handler sono endpoint pubblicamente raggiungibili: ognuno deve verificare autenticazione e autorizzazione. Sono adatti a download, callback e worker schedulati.
- `proxy.ts` aggiorna la sessione e può effettuare redirect ottimistici, ma non è un confine di autorizzazione.
- La logica di dominio riusabile vive in un livello server dedicato, non nei componenti React.
- Le invarianti concorrenti risiedono in vincoli e funzioni PostgreSQL, non soltanto nel codice Next.js.
- Il browser usa solo URL Supabase e publishable key. Service role, chiavi Resend e segreti dei job restano lato server.

### 15.3 Autenticazione, utenti e RLS

- Ogni utente Auth ha un profilo applicativo creato automaticamente con ruolo `USER`.
- Solo una funzione server privilegiata può assegnare `ADMIN` o modificare `is_active`.
- La gestione utenti usa la Supabase Admin API esclusivamente dal server. L'Admin può invitare, attivare, disattivare, cambiare ruolo e avviare il recupero password; non può leggere password esistenti.
- Le policy RLS consentono allo User di leggere le proprie richieste e all'Admin di leggere e gestire quanto previsto.
- Catalogo attivo e disponibilità sono leggibili dagli autenticati; le scritture sono Admin-only.
- Eventi, movimenti, job e audit non sono scrivibili direttamente dal client.
- Le funzioni `security definer` impostano un `search_path` sicuro, hanno permessi `EXECUTE` espliciti e verificano identità e ruolo.
- Server Actions e Route Handler ricontrollano sessione e ruolo: RLS è l'ultima linea di difesa, non l'unico controllo.

### 15.4 PDF, storage ed email asincrone

- Il bucket `datasheets` è privato; la lettura avviene tramite autorizzazione o signed URL a scadenza breve e la scrittura è Admin-only.
- Il bucket `generated-documents` è privato; un documento è accessibile solo al proprietario della richiesta e agli Admin.
- I PDF sono prodotti dagli snapshot storici, non rileggendo descrizioni correnti dal catalogo.
- La generazione usa il runtime Node.js, font incorporati e template versionato.
- La bozza segue il riferimento visivo del PDF mock: formato A4 verticale, marchio in alto a sinistra, titolo in alto a destra, linea navy, griglia per l'intestazione, tabella tecnica degli articoli e nota di stato sotto la tabella.
- Il template controlla direttamente intestazioni, piè di pagina e numerazione; non deve includere URL locali, titolo pagina o timestamp automatici del browser.
- Con più righe o pagine, l'intestazione della tabella si ripete, le righe non vengono spezzate e ogni pagina mostra progressivo o indicazione di bozza e numerazione pagina.
- Documento e notifica sono record di coda persistenti creati nella transazione di dominio.
- Il worker acquisisce i job con lock e timeout, usa retry con backoff e lascia in `FAILED` i job che superano il limite; l'Admin può rilanciarli.
- Resend riceve una chiave di idempotenza e il suo message ID viene salvato.
- Lo scheduler della piattaforma di deploy invoca un Route Handler protetto che elabora la coda. Provider e frequenza vanno confermati prima del rilascio.

### 15.5 Configurazione e segreti

Variabili pubbliche:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Variabili solo server:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `REQUEST_EMAIL_RECIPIENTS`, lista separata da virgole e validata all'avvio
- `JOB_RUNNER_SECRET`
- eventuali valori di retry e base URL applicativa

I destinatari non devono essere hardcoded. Locale, staging e produzione usano configurazioni e progetti Supabase distinti. Nessun segreto deve comparire nei log o nei file versionati.

### 15.6 Progressivo

- È generato da una funzione database con lock atomico e non è modificabile dalla UI.
- Il contatore può essere modificato soltanto con un'operazione amministrativa diretta sul database.
- Un reset non può produrre duplicati: se il numero riparte da `1`, il formato deve includere un namespace univoco, per esempio l'anno.
- Formato visibile e regola del namespace devono essere confermati prima della migration di produzione.

### 15.7 Qualità, date e osservabilità

- Validazione tramite schema condiviso dove utile e sempre ripetuta sul server.
- Vincoli database per interi positivi, univocità e integrità referenziale.
- Tutti i timestamp sono `timestamptz` in UTC e sono mostrati in `Europe/Rome` con locale italiano.
- Data e attore delle operazioni sono assegnati dal server/database.
- Paginazione server per catalogo, richieste, utenti e audit.
- Ricerca iniziale PostgreSQL case-insensitive su Part # e descrizione, con indici verificati sui dati reali.
- Cache disabilitata o invalidata esplicitamente per disponibilità e stati; nessun dato personalizzato finisce in cache condivise.
- Protezione origin/CSRF delle mutazioni, limiti ai payload e rate limit sugli endpoint sensibili.
- Errori utente comprensibili, senza stack trace, query o segreti.
- Log con correlation ID e identificativi applicativi; audit per ruoli, inventario, evasioni, retry ed eliminazioni.
- Accessibilità di base: tastiera, focus visibile, contrasto, etichette, errori associati e touch target adeguati.
- Migration SQL versionate in `supabase/migrations`; nessuna modifica manuale non replicata negli ambienti.
- Backup e procedura di ripristino Supabase verificati prima della produzione.

## 16. Ambito MVP consigliato

Per una prima versione web utilizzabile:

- autenticazione e ruoli User/Admin;
- gestione utenti completa da interfaccia Admin;
- catalogo iniziale importato e CRUD completo;
- import catalogo validato, tracciabile e ripetibile da `Caricamento Materiali.csv`;
- consultazione e ricerca materiali con ricerca testuale e filtri derivati dalla navigazione;
- gestione manuale o import iniziale delle giacenze, senza bypass della disponibilità;
- creazione richiesta multi-articolo-variante;
- prenotazione atomica della disponibilità;
- elenco e dettaglio richieste;
- evasione parziale articolo per articolo;
- cronologia dei rilasci e dei movimenti;
- PDF di bozza, richiesta iniziale e report finale;
- email automatiche con coda, log e retry;
- mini dashboard Admin con overview operativa;
- deploy web responsive.

Sono rimandabili:

- notifiche multicanale;
- dashboard e analytics;
- workflow approvativi;
- gestione acquisti, prezzi e anagrafiche commerciali dei fornitori; restano inclusi i soli riferimenti tecnici presenti nel catalogo;
- modalità offline.

## 17. Criteri di accettazione principali

1. Uno User non può vedere o modificare richieste altrui, anche chiamando direttamente API o database.
2. Un utente disattivato non può eseguire operazioni applicative.
3. Non si può inviare una richiesta vuota o con campi obbligatori mancanti.
4. Non si può aggiungere una quantità zero, negativa o decimale; per una variante tracciata non può superare la disponibilità, mentre una variante non tracciata è indicata come `unlimited` senza quantità fittizia.
5. Due invii concorrenti non possono prenotare oltre la giacenza delle sole varianti tracciate.
6. Un retry con lo stesso `client_request_id` e lo stesso payload normalizzato restituisce la richiesta già creata senza duplicarla; un payload differente viene rifiutato in modo stabile.
7. Una richiesta inviata riceve progressivo univoco e stato iniziale corretto.
8. L'Admin può evadere una riga in più passaggi senza superare il residuo.
9. Due evasioni concorrenti non possono superare il residuo o rendere negative giacenza e prenotazione delle sole varianti tracciate.
10. Ogni consegna appare nella cronologia con data server e operatore, anche per varianti non tracciate.
11. Lo stato di riga e richiesta cambia automaticamente secondo le quantità.
12. Lo User vede gli aggiornamenti delle proprie richieste.
13. Al completamento viene accodato una sola volta il report finale.
14. Un errore PDF o Resend non annulla la richiesta e può essere ritentato senza invii duplicati.
15. Il PDF storico mantiene i dati originari dopo modifiche al catalogo.
16. Datasheet e PDF privati non sono accessibili tramite URL pubblico permanente.
17. Il ruolo non è modificabile dal browser e la service role non compare nel bundle client.
18. L'eliminazione definitiva è limitata alle richieste evase, richiede conferma ed è registrata nell'audit minimale.
19. L'app è usabile su tablet e smartphone senza scorrimenti orizzontali nei flussi principali.
20. La distinta pre-invio riporta tutti i campi del PDF mock, è marcata come bozza e non contiene progressivo o artefatti del browser.
21. La generazione della bozza non crea richieste, non prenota materiale, non salva documenti ufficiali e non invia email.
22. L'import del CSV crea 236 varianti senza duplicare i codici Fabtek o Oracle e conserva tutte le associazioni di categoria marcate con `X`.
23. Un secondo import dello stesso file è idempotente e non duplica categorie, famiglie, componenti, varianti, riferimenti fornitore o asset.
24. `#VALUE!`, `nd`, link non validi e alias categoria non risolti vengono segnalati e non diventano dati applicativi validi.
25. L'import del catalogo non crea disponibilità, prenotazioni o movimenti di inventario.

## 18. Decisioni confermate e punti residui

Decisioni confermate:

- la richiesta prenota immediatamente la disponibilità al momento dell'invio soltanto per varianti con `track_inventory = true`; quelle non tracciate sono autorevolmente `unlimited` e non generano prenotazioni;
- gli articoli esauriti tracciati non possono essere richiesti;
- da **Cerca info materiali** si può iniziare una richiesta senza ripetere la navigazione;
- colonne e filtri della lista richieste seguono `mock.html`;
- il progressivo è gestito dal database e non dalla UI;
- i destinatari email sono configurati tramite una lista nell'ambiente;
- l'eliminazione definitiva delle richieste completate è consentita;
- le 14 categorie canoniche sono seed modificabili dagli Admin; il CSV aggiunge alias esterni, sei famiglie effettivamente utilizzate e 236 varianti;
- `Utilities` è un testo libero inserito dall'utente ed è distinto dalla categoria del catalogo;
- `mock pdf richiesta user.pdf` è il riferimento dati e visivo per la distinta pre-invio;
- stack: Next.js, Supabase Auth/Postgres/Storage, PDF lato Next.js e Resend;
- sono richieste la gestione utenti completa per Admin e una mini dashboard operativa.

Punti da confermare prima della produzione:

- equivalenza semantica tra il codice CSV `UPW` e la categoria canonica `DIW — UHP Water`;
- formato visibile del progressivo e namespace necessario per consentirne il reset senza collisioni;
- fonte e procedura di aggiornamento iniziale delle giacenze;
- provider di deploy, frequenza e autenticazione dello scheduler asincrono;
- mittente Resend e domini verificati;
- tempi di conservazione di audit, log, PDF e dati personali;
- differenze grafiche definitive tra bozza, richiesta ufficiale e report finale.

Codex può procedere sulle parti che non dipendono da questi punti. Deve chiedere conferma prima di fissare una scelta irreversibile o una migration di produzione collegata a essi.

## 19. Fonte e priorità delle informazioni

Questo documento consolida:

- le note funzionali iniziali dell'app;
- la specifica “Analisi App Cliente.md”;
- il prototipo cliccabile `mock.html`;
- la distinta di riferimento `mock pdf richiesta user.pdf`;
- le indicazioni di sicurezza raccolte in `rls.md`;
- lo stack effettivamente installato nel repository.

Priorità in caso di divergenze:

1. regole e requisiti espliciti di questo documento;
2. specifica funzionale v2.1;
3. note iniziali;
4. comportamento o dati mock del prototipo HTML.

Credenziali demo, date fisse, disponibilità simulate, codici articolo generati, utenti mock e componenti placeholder presenti nel prototipo non sono dati di produzione e non devono essere copiati come segreti, seed definitivi o regole applicative.
