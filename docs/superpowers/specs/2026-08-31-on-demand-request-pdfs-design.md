# PDF richiesta generati on-demand

**Data:** 2026-08-31

**Stato:** approvato

**Sostituisce:** il ciclo di vita persistente dei documenti ufficiali descritto in `2026-08-28-reusable-server-pdf-pipeline-design.md`

## 1. Obiettivo

Il dettaglio di una richiesta deve permettere di generare e scaricare i PDF ufficiali direttamente al click. I byte del documento vengono costruiti ogni volta dai dati autorevoli della richiesta e restituiti nella stessa risposta HTTP. Nessun PDF ufficiale viene conservato in database, filesystem, cache applicativa o Supabase Storage.

Restano disponibili due documenti:

- **Richiesta ufficiale**, generabile dal momento in cui la richiesta esiste;
- **Report finale**, generabile soltanto quando la richiesta è completamente evasa.

La distinta bozza mantiene il flusso on-demand già esistente e non cambia.

## 2. Scelta architetturale

L'applicazione passa dal modello asincrono `job -> rendering -> Storage -> email -> download` al modello sincrono `click -> autorizzazione -> lettura snapshot -> rendering -> download`.

Il renderer condiviso in `lib/pdf` e i contratti `initial_request` e `final_report` vengono mantenuti. Vengono rimossi dal percorso applicativo:

- record documento come prerequisito dell'interfaccia;
- worker di generazione e notifica;
- Supabase Storage per i PDF generati;
- download tramite `documentId`;
- email automatiche con PDF allegato;
- configurazione dedicata a job runner, Storage documentale e Resend.

Le tabelle metadata legacy possono restare temporaneamente nello schema. Gli RPC transazionali esistenti possono continuare a creare al massimo i relativi record pendenti, ma nessun processo li elabora e nessun file viene prodotto. Questa scelta evita di riscrivere, nello stesso intervento, le RPC atomiche e idempotenti di invio ed evasione.

## 3. Endpoint on-demand

La nuova superficie HTTP è:

```text
GET /api/requests/[requestId]/pdf/[kind]
```

`kind` ammette esclusivamente:

- `initial_request`;
- `final_report`.

Il Route Handler usa il runtime Node.js e, per ogni richiesta:

1. verifica sessione, profilo attivo e permesso di lettura richieste;
2. valida UUID e tipo documento prima di interrogare i dati;
3. crea un client Supabase legato alla sessione, senza service role;
4. carica intestazione, richiedente, snapshot delle righe e, solo per il report finale, tutte le evasioni;
5. lascia alla RLS la distinzione proprietario/Admin e tratta una richiesta invisibile come non trovata;
6. rifiuta il report finale se lo stato non è `evasa`;
7. costruisce il DTO ufficiale con il mapper condiviso;
8. genera il `Buffer` tramite il renderer condiviso;
9. restituisce il PDF come attachment con filename normalizzato.

La risposta PDF include almeno:

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="...pdf"
Cache-Control: private, no-store
```

Non vengono creati URL firmati, file temporanei persistenti o upload. Errori e risposte JSON usano anch'essi `Cache-Control: no-store`.

## 4. Accesso dati e consistenza

Il caricamento on-demand riusa i contratti e il mapping degli snapshot ufficiali, ma introduce un percorso autorizzato basato sul client di sessione invece del client Admin usato dal vecchio worker.

I dati documentali provengono esclusivamente da:

- `material_requests` per progressivo, data, intestazione, stato e richiedente;
- `material_request_lines` per gli snapshot immutabili del materiale e le quantità;
- `fulfillment_events` per la cronologia del solo report finale.

Le relazioni potenzialmente numerose continuano a essere lette con paginazione completa e ordinamento deterministico. Il PDF non rilegge il catalogo corrente e non usa dati forniti dal browser.

La richiesta ufficiale fotografa gli snapshot già persistiti e può essere generata con qualunque stato valido. Il report finale richiede `status = evasa`, quantità interamente evase e una cronologia coerente; le validazioni esistenti del mapper restano il controllo finale contro dati incompleti o contraddittori.

## 5. Interfaccia del dettaglio richiesta

La sezione **Documenti** non legge più `generated_documents` e non mostra stati `pending`, `processing`, `completed` o `failed`.

Mostra invece:

- un'azione **Genera PDF richiesta**, sempre disponibile;
- un'azione **Genera report finale**, disponibile soltanto per una richiesta `evasa`;
- prima dell'evasione completa, una breve nota discreta che spiega quando il report finale sarà disponibile, senza pulsante disabilitato.

Un piccolo Client Component esegue il download, mostra lo stato di generazione, impedisce doppi click durante la stessa operazione e presenta un errore italiano accessibile senza abbandonare la pagina. Il componente non riceve dati tecnici: soltanto `requestId`, tipo, etichetta e filename atteso.

Il dettaglio richiesta smette di selezionare e mappare la relazione `generated_documents`. Lo stato della richiesta è l'unica informazione necessaria per decidere quali azioni mostrare.

## 6. Dismissione del vecchio flusso

Vengono rimossi o resi irraggiungibili:

- `GET /api/documents/[documentId]`;
- `POST /api/internal/jobs`;
- bypass di sessione nel proxy dedicato al job runner;
- worker di documento e notifica;
- accesso applicativo al bucket `generated-documents`;
- moduli di configurazione e invio email usati soltanto dal worker;
- test del ciclo job, lease, upload, download Storage ed email.

Restano:

- `POST /api/documents/draft` per la distinta bozza;
- renderer, template, contratti e mapper PDF riutilizzabili;
- caricamento e mapping degli snapshot ufficiali, adattati al client di sessione;
- metadata legacy nel database finché non verranno rimossi insieme a una revisione dedicata delle RPC.

Una nuova migration:

1. elimina gli oggetti eventualmente presenti nel bucket `generated-documents`;
2. elimina le policy Storage dedicate;
3. rimuove il bucket `generated-documents`.

La migration non viene applicata automaticamente al progetto remoto. L'eliminazione dei file legacy è intenzionale e irreversibile dopo l'applicazione; il contenuto resta comunque rigenerabile dai dati della richiesta.

## 7. Errori e sicurezza

Il Route Handler distingue almeno:

- `401` per sessione assente;
- `403` per profilo inattivo o privo del permesso richiesto;
- `404` per UUID non valido, tipo non valido, richiesta assente o non visibile;
- `409` per report finale richiesto prima dell'evasione completa;
- `500` per errore infrastrutturale, mapping o rendering.

I messaggi non espongono SQL, stack trace, service key, destinatari, path Storage o dettagli di richieste altrui. I log contengono un codice operativo stabile e non il payload documentale.

Il client non decide l'autorizzazione né lo stato valido del report finale. Nascondere il pulsante è soltanto una regola di presentazione; l'endpoint ripete sempre il controllo server-side.

## 8. Test e criteri di accettazione

Lo sviluppo segue TDD.

### Route e dominio

- proprietario e Admin possono generare la richiesta ufficiale;
- utente non proprietario riceve `404` tramite RLS;
- sessione assente e profilo inattivo sono rifiutati prima del caricamento;
- UUID e tipo documento invalidi non interrogano il database;
- report finale non evaso restituisce `409` e non invoca il renderer;
- documento valido restituisce bytes PDF, filename e header no-store;
- errori di lettura o rendering restituiscono un errore stabile senza dettagli interni;
- nessun percorso on-demand invoca Storage o il client Admin.

### Dati

- richiesta ufficiale non carica le evasioni;
- report finale carica tutte le pagine di evasioni;
- righe ed eventi mantengono ordine deterministico;
- snapshot o quantità incoerenti vengono rifiutati;
- richieste con più di una pagina di righe restano complete.

### Interfaccia

- il pulsante della richiesta ufficiale è sempre presente;
- il pulsante del report finale appare soltanto nello stato `evasa`;
- durante il download il pulsante espone uno stato occupato e non duplica la richiesta;
- una risposta fallita mostra feedback italiano accessibile;
- il dettaglio funziona anche quando non esiste alcun record in `generated_documents`.

### Verifica finale

- suite automatica completa;
- typecheck, lint mirato e build Next.js;
- verifica reale autenticata dal dettaglio richiesta;
- download dei due tipi con firma `%PDF`, filename corretto e `Cache-Control: private, no-store`;
- verifica che nessun file venga creato nel bucket;
- controllo del diff e assenza di modifiche estranee.

## 9. Fuori ambito

- modifica grafica dei template PDF;
- editor dei documenti;
- firma digitale o PDF/A;
- invio manuale o automatico via email;
- applicazione della migration o deploy remoto;
- rimozione immediata delle tabelle metadata e riscrittura delle RPC transazionali.
