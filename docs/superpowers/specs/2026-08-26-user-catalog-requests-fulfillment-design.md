# Catalogo, richieste ed evasione — Design

## Obiettivo

Implementare il primo flusso applicativo completo di Fabtek Materiali sopra la baseline Next.js/Supabase esistente: consultazione e ricerca del catalogo, creazione di richieste multi-articolo, storico personale e gestione Admin delle evasioni. Le schermate devono usare dati reali protetti da RLS e il backend applicativo deve rispettare le transazioni PostgreSQL già previste.

## Ambito

Sono inclusi:

- shell applicativa autenticata con identità, ruolo, navigazione e logout;
- home con le tre azioni definite in `products.md`;
- catalogo consultabile tramite ricerca e navigazione Categoria → Famiglia → Componente → Variante;
- avvio di una richiesta dal catalogo;
- intestazione, carrello, riepilogo, stampa bozza e invio idempotente della richiesta;
- storico e dettaglio delle richieste del richiedente;
- elenco globale Admin e dettaglio con evasione parziale o completa per singola riga;
- modifica dello schema e delle RPC per varianti non soggette a stock;
- test automatici e verifica responsive dei flussi principali.

Sono esclusi:

- import del file `Caricamento Materiali.csv` e qualsiasi seed di prodotti;
- CRUD amministrativo di catalogo, inventario e utenti;
- dashboard Admin generale;
- API REST o altri endpoint HTTP applicativi pubblici;
- generazione dei PDF ufficiali, worker, email Resend e pannello job;
- deploy e applicazione di migration al progetto Supabase remoto.

Le schermate leggono esclusivamente i dati già presenti in Supabase. In assenza di catalogo o richieste mostrano stati vuoti espliciti.

## Scelte architetturali

L'implementazione segue il monolite modulare descritto in `ARCHITECTURE.md`:

- Server Components per le letture iniziali;
- DAL server-side per query Supabase e mapping verso DTO minimi;
- Server Actions autenticate per mutazioni originate dalla UI;
- servizi di dominio per validazione, autorizzazione e invocazione delle RPC;
- Client Components limitati a filtri interattivi, form, quantità e carrello;
- PostgreSQL e RLS come autorità per accesso, concorrenza, idempotenza e stato.

I Server Components non chiamano Route Handler interni. Non vengono introdotte API REST. Le Server Actions sono considerate superfici sensibili: validano sessione, profilo attivo, ruolo e payload prima di delegare alle RPC.

## Struttura applicativa

I moduli principali saranno:

- `lib/data/catalog.ts`: categorie, famiglie, componenti, varianti, ricerca e disponibilità;
- `lib/data/requests.ts`: liste e dettaglio richieste, righe e cronologia evasioni;
- `lib/domain/requests/`: validazione e invio tramite `submit_material_request`;
- `lib/domain/fulfillment/`: validazione Admin ed evasione tramite `fulfill_request_line`;
- `lib/validation/`: schemi e normalizzazione degli input condivisi;
- `components/layout/`: shell, navigazione e informazioni utente;
- `components/catalog/`: navigazione guidata, ricerca, schede e tabelle varianti;
- `components/requests/`: intestazione, carrello, riepilogo, lista e dettaglio;
- `components/admin/`: controlli di evasione e lista globale.

I componenti non interrogano direttamente il database. I moduli server-only non vengono riesportati verso Client Components.

## Semantica dello stock

`item_variants` riceve la colonna:

```sql
track_inventory boolean not null default false
```

La migration assegna `false` anche alle varianti già presenti. In questa fase tutte le varianti sono quindi considerate non limitate, salvo modifiche future effettuate direttamente sui dati o dalla successiva UI Admin.

Per una variante con `track_inventory = false`:

- il catalogo mostra “Disponibilità non limitata” senza quantità fittizie;
- qualsiasi quantità intera positiva è selezionabile entro il limite applicativo del payload;
- l'invio non richiede una riga in `inventory`;
- l'invio non controlla, blocca o incrementa `reserved_quantity`;
- non viene creato un movimento di prenotazione;
- l'evasione registra evento, quantità e stati ma non controlla o modifica inventario;
- non viene creato un movimento di evasione.

Per una variante con `track_inventory = true` restano invariati:

- disponibilità `on_hand_quantity - reserved_quantity`;
- lock deterministico delle righe inventario;
- rifiuto atomico quando una quantità non è disponibile;
- prenotazione all'invio;
- decremento di giacenza e prenotato all'evasione;
- movimenti immutabili per prenotazione ed evasione.

`get_catalog_availability()` restituisce per ogni variante attiva almeno `item_variant_id`, `track_inventory`, quantità disponibile nullable, soglia nullable e stato. Per le varianti non tracciate quantità e soglia sono `null` e lo stato è `unlimited`.

Le RPC `submit_material_request` e `fulfill_request_line` mantengono idempotenza, snapshot, calcolo stati e transazionalità per entrambe le modalità.

## Autenticazione, autorizzazione e RLS

Ogni pagina applicativa richiede una sessione Supabase valida e un profilo attivo. Il ruolo proviene esclusivamente da `profiles.role`.

- User e Admin leggono catalogo attivo e disponibilità sicura.
- User legge soltanto richieste, righe, documenti ed evasioni appartenenti alle proprie richieste.
- Admin legge tutte le richieste e può invocare l'RPC di evasione.
- Nessun ruolo applicativo scrive direttamente richieste, righe, evasioni o movimenti.
- Le azioni di evasione verificano `admin` nel backend applicativo e nuovamente nella RPC.
- Un identificativo non visibile per RLS viene trattato come risorsa non trovata, senza rivelarne l'esistenza.

Le policy della migration `20260826120000_enforce_active_profile_rls.sql` restano il riferimento per impedire accessi a utenti disattivati.

## Catalogo e ricerca

La route `/catalogo` supporta due modalità:

- ricerca testuale case-insensitive per codice Fabtek, codice Oracle e descrizione;
- navigazione guidata tramite categoria, famiglia e componente.

Filtri, query e paginazione sono eseguiti lato server e rappresentati nell'URL. Le varianti mostrano i dati tecnici disponibili, l'unità di misura, i riferimenti fornitore, il datasheet e lo stato di disponibilità. Dati mancanti non vengono sostituiti con placeholder inventati.

Il comando “Richiedi questo articolo” inizializza o aggiorna il carrello temporaneo e porta al flusso di nuova richiesta mantenendo variante e categoria selezionata.

## Nuova richiesta e carrello

La route `/richieste/nuova` raccoglie:

- Progetto #;
- Tool / Line #;
- Utilities, come testo libero distinto dalle categorie;
- note facoltative.

Richiedente e data sono mostrati come anteprima ma derivano rispettivamente dalla sessione e dal database. Il passaggio alla selezione resta bloccato finché i campi obbligatori non sono validi.

Il draft vive in un provider client limitato al flusso e viene persistito in `sessionStorage` per tollerare navigazione e refresh nella stessa scheda. Contiene soltanto intestazione, identificativi catalogo, categoria selezionata, quantità e `client_request_id`; i dati tecnici autorevoli vengono riletti e congelati dalla RPC.

La stessa variante compare una sola volta. Una nuova aggiunta aggiorna la quantità. Il riepilogo consente modifica e rimozione delle righe. Le quantità sono interi positivi; per varianti tracciate non possono superare la disponibilità osservata, fermo restando il controllo definitivo nella RPC.

La route `/richieste/nuova/riepilogo` offre:

- riepilogo completo;
- stampa browser della distinta marcata come bozza;
- invio tramite Server Action;
- prevenzione del doppio invio con `client_request_id` stabile;
- svuotamento del draft soltanto dopo una conferma positiva.

La bozza non viene persistita, non prenota materiale, non crea documenti e non invia email. La RPC continua a creare il record del documento ufficiale in stato pendente, che sarà elaborato nella futura Fase 4.

## Storico ed evasione

`/richieste` mostra allo User le proprie richieste ordinate dalla più recente con data, progressivo, progetto, numero righe e stato.

`/admin/richieste` mostra agli Admin tutte le richieste e aggiunge il richiedente. Filtri essenziali per testo e stato sono server-side.

`/richieste/[requestId]` è il dettaglio condiviso protetto dalla RLS. Mostra intestazione e snapshot delle righe con richiesto, evaso, residuo, stato e cronologia delle singole consegne.

Per gli Admin ogni riga con residuo positivo espone un form di evasione. La quantità parte da zero, deve essere positiva e non può eccedere il residuo. Ogni tentativo usa una `idempotency_key` stabile. Dopo il successo la route viene invalidata e riletta dal server.

Per varianti non tracciate, l'evasione aggiorna soltanto eventi, totali e stati. Per varianti tracciate aggiorna nella stessa transazione anche inventario e movimento.

## Routing e interfaccia

- `/`: home con Crea richiesta materiale, Cerca info materiali e Controlla/Gestisci richieste;
- `/catalogo`: ricerca e consultazione guidata;
- `/richieste/nuova`: intestazione, selezione e carrello;
- `/richieste/nuova/riepilogo`: bozza e invio;
- `/richieste`: storico personale;
- `/richieste/[requestId]`: dettaglio proprietario/Admin;
- `/admin/richieste`: elenco globale Admin.

La shell mostra nome, ruolo e logout. Lo stile segue il mock: navy Fabtek `#0B2545`, accento rame `#B8752B`, superfici chiare, controlli touch-friendly e gerarchia tipografica coerente. Le tabelle diventano card su schermi stretti; nessun flusso principale richiede scrolling orizzontale. Stati e disponibilità sono espressi con testo oltre al colore.

## Errori e stati UI

Ogni flusso gestisce esplicitamente loading, dati vuoti, errore e successo. Gli errori tecnici vengono mappati in codici applicativi e messaggi italiani senza dettagli SQL o stack trace.

Sono distinti almeno:

- sessione assente o profilo inattivo;
- accesso non autorizzato;
- richiesta o variante non trovata;
- intestazione o righe non valide;
- quantità non valida;
- disponibilità insufficiente per una variante tracciata;
- conflitto o retry idempotente;
- errore infrastrutturale inatteso.

Le azioni disabilitano il submit durante l'esecuzione, preservano i dati in caso di errore atteso e associano i messaggi ai campi pertinenti.

## Strategia di test e verifica

Lo sviluppo segue TDD per logica, validazione e mutazioni.

Test unitari:

- validazione intestazione, righe e quantità;
- mapping degli errori Supabase/PostgreSQL;
- trasformazione DTO e calcolo delle etichette di disponibilità;
- autorizzazione e routing User/Admin;
- gestione del draft e deduplicazione delle varianti.

Test di integrazione con Supabase locale:

- RLS tra User A, User B, Admin e profilo inattivo;
- catalogo vuoto e catalogo popolato da fixture di test;
- invio idempotente con variante non tracciata senza riga inventario;
- invio con variante tracciata disponibile e non disponibile;
- storico personale e lista globale Admin;
- evasione parziale e completa senza stock;
- evasione tracciata con aggiornamento atomico dell'inventario;
- retry della stessa evasione senza duplicazioni.

Verifica applicativa:

- lint, typecheck e build;
- pagine renderizzate con stati vuoti e popolati;
- flusso User completo dalla ricerca alla conferma;
- flusso Admin dalla lista all'evasione;
- accesso diretto negato a richieste altrui;
- controllo responsive a viewport smartphone, tablet e desktop;
- controllo stampa della bozza senza elementi di navigazione.

## Aggiornamento documentazione

`products.md` e `ARCHITECTURE.md` saranno aggiornati per registrare la nuova semantica `track_inventory`. La regola precedente “nessun bypass della disponibilità” continuerà a valere solo per varianti con controllo stock attivo; `track_inventory = false` è una modalità di dominio esplicita, non un bypass deciso dal client.
