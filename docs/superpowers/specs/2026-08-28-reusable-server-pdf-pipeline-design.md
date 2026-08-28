# Pipeline PDF server-side riutilizzabile

**Data:** 2026-08-28

**Stato:** approvato

**Ambito:** distinta bozza, richiesta ufficiale e report finale

## 1. Obiettivo

Sostituire completamente la stampa browser con PDF reali generati nel runtime Node.js di Next.js. La soluzione deve usare un solo motore di rendering, essere riutilizzabile da Route Handler, worker e test, e mantenere distinti i tre cicli di vita documentali:

| Documento | Persistito | Origine dati | Email |
|---|---:|---|---:|
| Distinta bozza | No | Draft corrente validato dal server | No |
| Richiesta ufficiale | Sì | Snapshot persistiti dopo la prenotazione | Sì |
| Report finale | Sì | Snapshot ed evasioni persistite | Sì |

Nessun PDF deve dipendere da `window.print()`, CSS di stampa o intestazioni e footer automatici del browser.

## 2. Scelta tecnica

Il renderer usa `@react-pdf/renderer` con una versione esatta compatibile con React 19. La libreria viene caricata esclusivamente da moduli server-only ed eseguita nel runtime Node.js.

La scelta è motivata da:

- composizione dichiarativa di template semplici;
- componenti condivisi per struttura e stile;
- supporto A4, wrapping multipagina, elementi fissi e font incorporati;
- generazione diretta di un `Buffer`, utilizzabile da una risposta HTTP, da Supabase Storage o da Resend;
- assenza di browser headless e relativi costi operativi.

PDFKit rimane un'alternativa valida ma richiederebbe più gestione manuale di layout e paginazione. Chromium/Puppeteer non è giustificato per documenti così semplici.

## 3. Architettura del renderer

`lib/pdf` contiene codice server-only organizzato per responsabilità concrete:

```text
lib/pdf/
  contracts.ts
  render-pdf.tsx
  styles.ts
  components/
  templates/
```

- `contracts.ts` definisce DTO discriminati per `draft`, `initial_request` e `final_report`.
- `render-pdf.tsx` accetta un DTO valido, seleziona il template e restituisce `Promise<Buffer>`.
- `styles.ts` contiene esclusivamente token e stili PDF condivisi.
- `components` contiene gli elementi realmente riusati: pagina A4, testata Fabtek, intestazione richiesta, tabella materiali e footer.
- `templates` compone i componenti condivisi senza accedere a database, autenticazione, Storage o email.

Il renderer è una funzione pura rispetto alle infrastrutture: riceve tutti i dati necessari e produce bytes PDF. Date, progressivi, nomi e quantità vengono risolti prima del rendering.

## 4. Modello dei documenti

Il contratto comune comprende:

- tipo e versione del template;
- titolo e stato visuale;
- richiedente;
- progetto, Tool / Line, Utilities e note;
- data documentale;
- righe materiale con codici, categoria, famiglia, componente, descrizione, caratteristiche tecniche, unità di misura e quantità.

Le estensioni specifiche sono:

- la bozza espone il marcatore `BOZZA` e non ha progressivo ufficiale;
- la richiesta ufficiale espone numero richiesta, data effettiva e stato;
- il report finale espone quantità richiesta, consegnata, residua e cronologia delle evasioni.

I template ufficiali usano soltanto gli snapshot persistiti. Il renderer non rilegge mai il catalogo corrente per ricostruire un documento storico.

## 5. Layout condiviso

I documenti usano:

- formato A4 verticale;
- margini costanti;
- logo e font incorporati nell'applicazione;
- testata Fabtek e titolo documento;
- blocco dati richiesta;
- tabella materiali multipagina;
- intestazione tabella ripetuta;
- righe mantenute unite quando lo spazio lo consente;
- footer e numerazione `Pagina X di Y`;
- colori e tipografia coerenti con il mock, senza artefatti automatici del browser.

Il mock PDF del repository è il riferimento visivo per la bozza, esclusi data/ora, URL locale e numero pagina generati dalla stampa Windows. Richiesta ufficiale e report finale riusano la stessa base grafica con le sole sezioni aggiuntive necessarie.

## 6. Flusso distinta bozza

Il frontend sostituisce `window.print()` con un download autenticato:

1. il pulsante invia il draft a `POST /api/documents/draft`;
2. il Route Handler verifica sessione e profilo attivo;
3. valida intestazione, identificativi e quantità con le regole di dominio condivise;
4. rilegge catalogo, categorie e disponibilità autorevoli;
5. rifiuta righe mancanti, duplicate, inattive o non più valide;
6. costruisce il DTO bozza e genera il PDF;
7. restituisce `application/pdf`, `Content-Disposition: attachment` e `Cache-Control: no-store`.

La bozza non crea una richiesta, non prenota materiale, non viene salvata in Storage e non genera email. Il frontend gestisce stato di caricamento, download del blob ed errore accessibile. La sezione `print-only` e le regole CSS non più necessarie vengono rimosse.

## 7. Flusso documenti ufficiali

Le RPC esistenti continuano a creare un record univoco in `generated_documents`:

- `initial_request` dopo il commit della richiesta e della prenotazione;
- `final_report` quando l'evasione completa porta la richiesta allo stato `evasa`.

Un worker riutilizzabile elabora piccoli batch:

1. acquisisce un documento `pending` o scaduto con lease atomico;
2. carica richiesta, richiedente, snapshot e, per il report, evasioni;
3. costruisce il DTO tipizzato;
4. genera il PDF e ne calcola SHA-256;
5. carica il file nel bucket privato `generated-documents` con percorso deterministico;
6. completa il record con `storage_path`, hash, versione template e timestamp;
7. crea una sola `notification_jobs` con destinatari e oggetto già risolti.

Il percorso deterministico rende sicuro il retry dopo un caricamento riuscito ma prima dell'aggiornamento database. Il vincolo unico `(request_id, document_type)` impedisce documenti logici duplicati.

## 8. Email e retry

Dopo il completamento del documento, lo stesso worker elabora le notifiche:

1. acquisisce il job con lease;
2. verifica che il documento sia completo;
3. scarica il PDF privato;
4. invia tramite Resend ai destinatari configurati in `REQUEST_EMAIL_RECIPIENTS`;
5. usa una chiave di idempotenza stabile derivata dal job;
6. registra `provider_message_id` e `sent_at`.

Gli stati esistenti `pending`, `processing`, `completed` e `failed`, insieme a `attempts`, `next_attempt_at`, `lease_expires_at` e `last_error`, governano retry e backoff. Un errore PDF o email non annulla la richiesta già confermata. Un PDF completato non viene rigenerato soltanto perché l'email deve essere ritentata.

Il Route Handler `POST /api/internal/jobs` è protetto da `JOB_RUNNER_SECRET`, usa confronto costante del segreto e limita il numero di job per invocazione. Uno scheduler esterno lo richiama periodicamente. Payload, destinatari, token e dettagli infrastrutturali non vengono scritti nei log.

## 9. Download autorizzato

`GET /api/documents/[documentId]`:

- richiede sessione e profilo attivo;
- valida l'UUID;
- legge metadati tramite RLS;
- consente l'accesso al proprietario della richiesta o a un Admin;
- restituisce soltanto documenti completati con path valido;
- scarica dal bucket privato senza esporre URL permanenti;
- restituisce filename normalizzato e `Cache-Control: private, no-store`.

Il dettaglio richiesta mostra lo stato dei documenti disponibili e il pulsante di download soltanto quando il file è completo. Uno stato fallito non espone `last_error` tecnico agli utenti non Admin.

## 10. Configurazione

Un modulo server-only valida senza fallback silenziosi:

- `SUPABASE_SERVICE_ROLE_KEY` per worker e Storage;
- `RESEND_API_KEY`;
- `EMAIL_FROM`;
- `REQUEST_EMAIL_RECIPIENTS` come lista normalizzata e non vuota;
- `JOB_RUNNER_SECRET`;
- limiti di batch, tentativi e backoff se configurabili.

La generazione sincrona della bozza non dipende dalle variabili email o worker. Una configurazione mancante deve fallire soltanto il sottosistema che la richiede e produrre un errore contestualizzato.

## 11. Errori e osservabilità

- Gli endpoint restituiscono messaggi italiani stabili senza stack, SQL, path interni o segreti.
- Il renderer distingue dati documentali invalidi da errori di generazione.
- Il worker registra identificativo job, fase, tentativo, durata e codice errore, non il payload completo.
- Gli aggiornamenti di stato sono condizionati al lease posseduto per evitare che worker concorrenti completino lo stesso job.
- Dopo il limite di tentativi il job passa a `failed`; un futuro retry Admin potrà riportarlo a `pending` senza creare un nuovo job logico.

## 12. Test e criteri di accettazione

### Unitari

- validazione e mapping dei tre DTO;
- selezione del template;
- filename, oggetti email e destinatari;
- retry, backoff e transizioni di stato;
- contenuto minimo dei tre PDF.

### Integrazione

- generazione bozza autenticata senza persistenza;
- acquisizione concorrente dei job e recupero lease scaduto;
- upload idempotente e hash persistito;
- creazione univoca della notifica;
- retry email senza rigenerazione del PDF;
- download consentito a proprietario/Admin e negato agli altri utenti.

### PDF e interfaccia

- documento a pagina singola;
- documento con abbastanza righe da produrre più pagine;
- intestazioni ripetute e numerazione corretta;
- testi italiani e caratteri accentati con font incorporato;
- render delle pagine in PNG e controllo visivo rispetto al mock;
- pulsante di download con loading, successo ed errore;
- assenza di `window.print()` e degli artefatti di stampa browser.

### Verifiche finali

- diff completo e assenza di cambiamenti estranei;
- test pertinenti;
- lint;
- typecheck;
- build Next.js;
- prova reale degli endpoint con PDF valido e header HTTP corretti.

## 13. Fuori ambito

- editor visuale dei template;
- template configurabili da database;
- firma digitale o PDF/A;
- anteprima PDF incorporata nel browser;
- nuovi tipi di documento non ancora richiesti;
- deploy dello scheduler o modifica di ambienti remoti senza autorizzazione esplicita.
