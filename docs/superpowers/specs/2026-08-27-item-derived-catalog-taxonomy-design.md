# Tassonomia del catalogo derivata dagli item — Design

## Obiettivo

Correggere il contratto tra categorie, famiglie, componenti e item affinché l'unità autorevole del catalogo sia sempre `item_variants`, cioè il singolo articolo richiedibile identificato dal codice Fabtek.

La navigazione continua a presentare l'imbuto Categoria → Famiglia → Componente → Item, ma i passaggi non rappresentano una gerarchia persistita tra categoria e famiglia. Famiglie e componenti disponibili per una categoria vengono dedotti esclusivamente dagli item attivi associati a quella categoria.

## Contratto dati autorevole

Le sole relazioni di dominio sono:

- ogni `item_variant` appartiene a un solo `component` tramite `item_variants.component_id`;
- ogni `component` appartiene a una sola `family` tramite `components.family_id`;
- ogni `item_variant` può essere associato a N `categories` tramite `item_variant_categories`;
- una `category` non ha una relazione diretta persistita con `family` o `component`;
- una `family` non ha una relazione diretta persistita con gli item: li raggruppa transitivamente attraverso i propri componenti.

Il percorso completo di un item è quindi:

```text
family ← component ← item_variant → item_variant_categories → category
```

Una coppia categoria–famiglia esiste soltanto quando almeno un item attivo della famiglia è associato alla categoria. Analogamente, una coppia categoria–componente esiste soltanto quando almeno un item attivo del componente è associato alla categoria.

## Alternative considerate

### Relazioni derivate direttamente dagli item — scelta adottata

Le query attraversano `item_variant_categories`, `item_variants`, `components` e `families`, eliminando i duplicati nel mapping applicativo. Non esiste una seconda fonte di verità e ogni modifica all'associazione di un item produce immediatamente la navigazione corretta.

### Vista SQL derivata

Una vista potrebbe esporre le coppie categoria–famiglia e categoria–componente. Ridurrebbe parte della verbosità delle query, ma aggiungerebbe una superficie database e regole di sicurezza da mantenere senza offrire un vantaggio necessario per il volume attuale.

### Tabella `category_families` sincronizzata

Mantenere la tabella come cache richiederebbe trigger o job di sincronizzazione. Questa soluzione conserva due fonti di verità e può produrre percorsi non coerenti con gli item; viene esclusa.

## Migrazione dello schema

Una nuova migration forward-only, successiva a `20260827103000_add_catalog_icon_keys.sql`, elimina il vecchio contratto senza riscrivere la migration iniziale già tracciata.

La migration:

1. elimina i trigger che validano le associazioni item–categoria contro `category_families`;
2. elimina i trigger che impediscono il cambio di famiglia di un componente o il cambio di componente di un item in base a `category_families`;
3. elimina le relative funzioni trigger;
4. elimina la tabella `category_families` con policy, indici e grant collegati;
5. conserva integralmente `item_variant_categories`, `item_variants`, `components`, `families` e `categories`.

Non serve migrare dati da `category_families`: le associazioni autorevoli item–categoria esistono già in `item_variant_categories`. La rimozione non modifica richieste storiche, snapshot o selezioni di categoria salvate nelle righe delle richieste.

La migration viene applicata e verificata esclusivamente sul Supabase locale. Non sono autorizzati push al progetto remoto, deploy o import di catalogo.

## Lettura e navigazione del catalogo

### Categorie

Il primo step mostra tutte le categorie attive, ordinate tramite `sort_order` e nome, anche quando una categoria non possiede ancora item attivi. Una categoria senza item conduce a uno stato vuoto esplicito nello step famiglie.

### Famiglie di una categoria

Selezionata una categoria, le famiglie vengono dedotte con il percorso:

```text
category
→ item_variant_categories
→ item_variants attivi
→ components attivi
→ families attive
```

Ogni famiglia compare una sola volta. L'ordine usa `families.sort_order` e `families.name`; non esiste più un ordinamento specifico per coppia categoria–famiglia.

### Componenti di categoria e famiglia

Selezionata una famiglia, vengono mostrati soltanto i componenti attivi che:

- appartengono alla famiglia scelta;
- possiedono almeno un item attivo associato alla categoria scelta.

Questo corregge il comportamento attuale, che filtra i componenti soltanto per famiglia e può mostrare gruppi privi di item nella categoria selezionata.

### Item di categoria, famiglia e componente

Selezionato un componente, la lista contiene soltanto item attivi che:

- appartengono al componente scelto;
- tramite il componente appartengono alla famiglia scelta;
- sono associati alla categoria scelta in `item_variant_categories`.

La categoria selezionata continua a essere salvata nella riga della bozza e validata dalla RPC di invio direttamente contro l'associazione item–categoria.

## Ricerca tassonomica

La ricerca continua a restituire categorie, famiglie o componenti e a ricondurre l'utente al punto corretto dell'imbuto.

- Una categoria attiva corrispondente viene mostrata direttamente, anche se vuota.
- Una famiglia corrispondente genera un risultato per ogni categoria raggiungibile tramite almeno un suo item attivo.
- Un componente corrispondente genera un risultato per ogni categoria raggiungibile tramite almeno un suo item attivo.
- Famiglie e componenti senza item attivi associati a una categoria non generano percorsi di navigazione pubblici.
- I duplicati prodotti da più item dello stesso percorso vengono eliminati in modo deterministico.

Il click su un risultato continua a produrre URL con `category`, `family` e, quando applicabile, `component`.

## Accesso ai dati, RLS e API

Le letture restano server-side in `lib/data/catalog.ts` e usano il client Supabase autenticato. Le policy RLS già presenti su categorie, famiglie, componenti, item e `item_variant_categories` restano l'autorità di accesso.

Non vengono introdotte API HTTP, Route Handler, RPC pubbliche o client privilegiati. Il browser non interroga direttamente nuove superfici dati. Le RPC di invio richiesta restano valide perché verificano già la compatibilità tramite `item_variant_categories` e non dipendono da `category_families`.

Le query selezionano soltanto identificativi, nomi, icone e ordinamenti necessari alla navigazione. Gli indici esistenti su `item_variant_categories(category_id, item_variant_id)` e `item_variants(component_id)` supportano il percorso principale; eventuali nuovi indici verranno aggiunti soltanto se il piano di esecuzione locale evidenzia una necessità reale.

## Mapping e canonicalizzazione

`CatalogFilterOptions` conserva l'interfaccia corrente con array di categorie, famiglie e componenti. Cambia soltanto la provenienza dei dati.

Il mapper:

- elimina duplicati per identificativo dopo la query relazionale;
- conserva `icon_key`, `sort_order` e nome dell'entità effettiva;
- scarta righe relazionali incomplete invece di inventare percorsi;
- mantiene la canonicalizzazione sequenziale: categoria valida, poi famiglia derivata dalla categoria, poi componente derivato da entrambe;
- azzera i discendenti e la pagina quando un parametro non appartiene al percorso derivato.

Catalogo informativo e selezione materiali riusano lo stesso contratto, quindi non possono divergere.

## Seed, fixture e documentazione

Il seed e le fixture di test non devono più inserire righe in `category_families`. Per rendere disponibile un percorso devono creare:

1. famiglia;
2. componente appartenente alla famiglia;
3. item appartenente al componente;
4. associazione tra item e categoria.

`products.md` e `ARCHITECTURE.md` vengono aggiornati per rimuovere `CategoryFamily` e dichiarare esplicitamente che categoria–famiglia e categoria–componente sono proiezioni derivate dagli item.

Il file sorgente `Analisi App Cliente.md` resta un documento storico di input e non viene riscritto; il suo imbuto descrive la UX, non il contratto relazionale.

## Errori e stati vuoti

- Categoria senza item: pagina famiglie vuota con possibilità di tornare alle categorie o usare la ricerca.
- Famiglia non raggiungibile dalla categoria: il filtro viene canonicalizzato al livello categoria.
- Componente non raggiungibile dalla coppia categoria–famiglia: il filtro viene canonicalizzato al livello famiglia.
- Item disattivato o associazione rimossa: non compare più nel percorso; una selezione diretta obsoleta viene trattata come non disponibile.
- Errore Supabase: viene mantenuto l'errore applicativo stabile già usato dal catalogo, senza esporre dettagli SQL.

## Strategia di test e verifica

Lo sviluppo segue TDD.

Test di mapping e navigazione:

- tutte le categorie attive sono visibili, comprese quelle senza item;
- una categoria mostra soltanto famiglie raggiunte dai propri item attivi;
- più item dello stesso percorso non duplicano famiglia o componente;
- una famiglia mostra soltanto componenti con item nella categoria selezionata;
- un item associato a più categorie rende lo stesso componente e la stessa famiglia raggiungibili da ciascuna categoria;
- item, componente o famiglia inattivi non generano percorsi;
- parametri categoria–famiglia–componente incoerenti vengono canonicalizzati al livello valido più vicino;
- la ricerca di famiglia e componente genera esclusivamente percorsi dedotti dagli item.

Test Supabase locale:

- la migration rimuove `category_families`, trigger e funzioni obsolete;
- `item_variant_categories` accetta associazioni indipendentemente dalla famiglia del componente;
- il catalogo autenticato rispetta ancora la RLS;
- l'RPC di invio accetta una categoria realmente associata all'item e rifiuta una categoria non associata;
- le fixture stock e richiesta funzionano senza creare `category_families`.

Verifica applicativa:

- test completi, typecheck, lint e build;
- navigazione reale Categoria → Famiglia → Componente → Item su Supabase locale;
- ricerca di categoria, famiglia e componente;
- stesso comportamento in `/catalogo` e `/richieste/nuova/materiali`;
- nessuna modifica remota, nessun push e nessun deploy.

## Criteri di accettazione

1. `category_families` non esiste più nello schema corrente.
2. Le categorie attive sono sempre tutte visibili al primo step.
3. Famiglie e componenti sono visibili soltanto se raggiungibili dagli item attivi della categoria selezionata.
4. Un item associato a più categorie appare correttamente in ogni relativo percorso.
5. Non esiste alcuna fonte persistita alternativa per una relazione categoria–famiglia.
6. Ricerca e navigazione guidata producono gli stessi percorsi derivati.
7. La selezione e l'invio della richiesta continuano a validare direttamente item e categoria.
8. RLS e confini applicativi restano invariati e non vengono aggiunte API pubbliche.
9. La migration è verificata soltanto in locale e non viene effettuato alcun push o deploy.
