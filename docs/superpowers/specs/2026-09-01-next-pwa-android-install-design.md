# Fabtek Materiali - PWA Android e installazione

## Obiettivo

Rendere Fabtek Materiali installabile su Android come Progressive Web App con un'esperienza standalone coerente con un'applicazione nativa. L'app resta interamente online in questa fase. La struttura deve permettere una futura modalità offline senza introdurre oggi cache implicite o dati obsoleti.

## Requisiti approvati

- L'installazione primaria è destinata a Chrome e browser Chromium su Android.
- L'app installata si apre senza barra del browser, in modalità `standalone`.
- Un piccolo pulsante flottante in basso a destra apre il prompt di installazione del browser.
- Il pulsante è mostrato solo quando il browser dichiara l'app installabile e non è già in modalità standalone.
- L'utente deve confermare il prompt di sistema; non è prevista né tecnicamente possibile un'installazione silenziosa.
- Manifest, icone, colori e nome devono usare il branding Fabtek esistente.
- In questa fase nessuna pagina, risposta API, PDF o dato autenticato viene reso disponibile offline.
- L'assenza di rete mantiene il normale errore di navigazione del browser. Una schermata offline dedicata sarà parte di un'attività futura.

## Non obiettivi

- Cache offline di richieste, catalogo, profilo, autenticazione o documenti.
- Accodamento offline di mutazioni o sincronizzazione in background.
- Notifiche push.
- Pubblicazione su Google Play o generazione di un APK/TWA.
- Prompt personalizzati per iOS, dove `beforeinstallprompt` non è disponibile.
- Modifiche a Supabase, schema dati, RLS o API applicative.

## Architettura

### Manifest Next.js

Un nuovo `app/manifest.ts` usa l'API metadata nativa di Next.js 16 e restituisce un manifest statico con:

- `id`, `scope` e `start_url` impostati a `/`;
- `name` "Fabtek Materiali" e `short_name` "Fabtek";
- descrizione italiana coerente con i metadata correnti;
- `lang: "it"` e `dir: "ltr"`;
- `display: "standalone"`;
- colori di sfondo e tema derivati dalla palette corrente (`#ffffff` e `#0b2545`);
- categorie `business` e `productivity`;
- `prefer_related_applications: false`;
- icone PNG 192x192 e 512x512 per uso normale e un'icona 512x512 con safe area per uso `maskable`.

Non viene forzato l'orientamento: telefoni e tablet devono poter usare sia portrait sia landscape.

### Icone applicative

Le icone vengono derivate dal simbolo grafico già presente in `public/logo.png`, senza ridisegnare o reinterpretare il marchio. Il simbolo è centrato su una superficie quadrata coerente con la palette Fabtek e mantiene una safe area sufficiente per il ritaglio maskable di Android.

Gli asset previsti sono:

- `public/icons/icon-192.png`;
- `public/icons/icon-512.png`;
- `public/icons/icon-maskable-512.png`;
- `public/icons/apple-touch-icon.png` da 180x180, utile come metadata compatibile senza aggiungere un flusso iOS dedicato.

Le immagini devono avere dimensioni reali corrispondenti al nome file e non devono contenere trasparenze problematiche per launcher Android.

### Metadata della shell

`app/layout.tsx` integra:

- riferimento alle icone applicative e Apple touch icon;
- colore tema per modalità chiara e scura tramite viewport metadata;
- indicazione Apple standalone compatibile;
- il componente client globale che registra il service worker e gestisce l'installazione.

Il componente vive nel root layout affinché l'installazione sia disponibile sia nelle pagine di autenticazione sia nell'area autenticata.

### Service worker online-only

`public/sw.js` costituisce il confine futuro per l'offline ma, in questa fase, non registra alcun listener `fetch` e non apre alcuna cache.

Il worker gestisce soltanto:

- `install`, attivando immediatamente la nuova versione con `skipWaiting()`;
- `activate`, prendendo il controllo delle pagine aperte con `clients.claim()`.

Non vengono cancellate cache generiche: in futuro le cache PWA avranno nomi versionati e potranno essere migrate senza rischiare dati appartenenti ad altri script o ambienti.

`next.config.ts` serve `/sw.js` con:

- `Content-Type: application/javascript; charset=utf-8`;
- `Cache-Control: no-cache, no-store, must-revalidate`;
- `X-Content-Type-Options: nosniff`;
- CSP limitata al worker con sorgenti `self`.

Il matcher del proxy continua a non applicarsi agli asset PNG. Verranno esclusi esplicitamente anche `sw.js` e `manifest.webmanifest` per evitare accessi a Supabase e redirect di autenticazione durante registrazione, aggiornamento e verifica dell'installabilità.

### Registrazione e pulsante d'installazione

Un singolo componente client, `components/pwa/install-app-button.tsx`, mantiene il comportamento PWA isolato dalla logica di dominio.

Al mount:

1. verifica il supporto ai service worker;
2. registra `/sw.js` con scope `/` e `updateViaCache: "none"`;
3. rileva la modalità standalone tramite `matchMedia("(display-mode: standalone)")`;
4. ascolta `beforeinstallprompt`, ne impedisce la promozione automatica e conserva temporaneamente l'evento;
5. ascolta `appinstalled` e i cambi di display mode per rimuovere il controllo quando l'app è installata.

Il pulsante:

- resta assente dal DOM finché non esiste un evento di installazione valido;
- è una piccola azione flottante, touch-friendly, in basso a destra e sopra il contenuto senza coprire controlli principali;
- usa il componente `Button` esistente, un'icona Lucide e un'etichetta accessibile "Installa app";
- al click invoca `prompt()` esclusivamente come conseguenza del gesto utente;
- elimina l'evento dopo il primo utilizzo, indipendentemente da accettazione o rifiuto, perché ogni evento può essere consumato una sola volta;
- scompare dopo `appinstalled` o quando l'app è già standalone.

Se registrazione o aggiornamento del worker falliscono, l'errore viene registrato con un messaggio contestualizzato senza bloccare l'app. Il pulsante non inventa fallback quando il browser non fornisce `beforeinstallprompt`.

## Sicurezza e dati

- Il service worker non intercetta richieste e non persiste risposte.
- Endpoint autenticati, PDF e payload Supabase restano sempre network-only.
- Il worker e il manifest sono asset pubblici e non contengono secret.
- La registrazione funziona in produzione solo sotto HTTPS; `localhost` resta valido per i test browser locali.
- L'installazione non modifica sessioni, cookie o policy RLS.
- L'implementazione non aggiunge dipendenze npm.

## Strategia di aggiornamento

Il worker online-only può attivarsi immediatamente senza rischio di servire bundle incompatibili, perché non controlla la rete. In futuro, prima di aggiungere caching, la strategia dovrà essere rivalutata introducendo:

- nomi cache versionati;
- precache limitato alla shell pubblica;
- network-only obbligatorio per auth, API, PDF e mutazioni;
- una pagina offline esplicita;
- gestione coordinata degli aggiornamenti quando una nuova shell è disponibile.

Questa separazione evita di dover sostituire il punto di registrazione o il contratto del pulsante quando verrà aggiunto l'offline.

## Test e verifica

L'implementazione segue TDD e aggiunge test che dimostrano:

- contenuto e completezza del manifest, incluse icone normali e maskable;
- presenza dei file icona con dimensioni corrette;
- header esatti di `/sw.js` ed esclusione dal proxy autenticato sia del worker sia del manifest;
- assenza di listener `fetch`, Cache API e precache nel worker online-only;
- registrazione con scope `/` e `updateViaCache: "none"`;
- pulsante nascosto senza evento installabile o in modalità standalone;
- invocazione singola di `prompt()` al click e rimozione dopo rifiuto, accettazione o `appinstalled`;
- accessibilità e dimensione touch del pulsante.

Verifiche finali:

- suite completa `npm test`;
- lint mirato e globale, riportando separatamente eventuali problemi preesistenti;
- build Next.js di produzione;
- risposta HTTP di manifest, icone e `/sw.js`, inclusi MIME type e header;
- controllo in Chrome DevTools del manifest e della registrazione worker;
- prova del prompt su un contesto sicuro, tenendo conto che Chrome applica proprie euristiche prima di emettere `beforeinstallprompt`.

## Criteri di accettazione

1. Chrome Android riconosce Fabtek Materiali come installabile sotto HTTPS.
2. L'icona installata è quadrata, leggibile e non tagliata dal launcher.
3. L'app installata si apre in modalità standalone dalla home screen.
4. Il pulsante flottante appare soltanto quando può realmente aprire il prompt.
5. Un click apre il prompt di sistema una sola volta e il controllo scompare dopo il consumo.
6. Nessun dato autenticato o documento viene salvato dal service worker.
7. La normale applicazione continua a funzionare se service worker o install prompt non sono supportati.
8. Manifest, worker e icone sono serviti con status, MIME type e header corretti.
