**FABTEK**  
*Integrated Solution for Industries*

**Richiesta Materiali — App Snella**

Documento di specifica funzionale — flusso e schermate

Versione 2 — aggiornata con disponibilità a magazzino, stampa e livelli utente Admin/User  
Preparato per: Andrea Pellegrini — Fabtek

# 1\. Obiettivo e contesto

Questo documento descrive il progetto di una nuova app, più snella e focalizzata, pensata per tre azioni quotidiane legate ai materiali di cantiere/produzione: creare una richiesta di materiale, cercare informazioni su un materiale, e controllare lo stato delle proprie richieste già inviate.

L'app riprende il linguaggio visivo e la logica di navigazione a categorie già usati sul sito e sui cataloghi Fabtek (schermate di esempio fornite come riferimento di stile): grandi riquadri fotografici cliccabili per orientarsi tra le categorie, e tabelle semplici per l'inserimento dati e la ricerca.

L'obiettivo finale è integrare questo flusso nell'app nativa Windows già realizzata (Fabtek Materiali, client/server in C con database condiviso in rete): il database e la logica di riserva/magazzino restano quelli già costruiti e testati; qui si progetta un'interfaccia più semplice e guidata per la sola parte di richiesta/ricerca materiale, da usare anche su palmari da cantiere.

Rispetto alla prima versione di questo documento, sono stati aggiunti e validati sul prototipo cliccabile: la disponibilità a magazzino visibile già in fase di richiesta, la quantità che parte sempre da zero, la stampa/esportazione PDF della richiesta prima dell'invio, e due livelli di accesso — Admin e User — con permessi differenziati (dettaglio al capitolo 7).

# 2\. Struttura di navigazione

L'app si apre sempre su una pagina di accesso (utente e password): da lì il sistema riconosce se chi accede è un Richiedente (User) o un addetto Magazzino (Admin) e mostra l'interfaccia corrispondente — dettaglio completo dei due livelli al capitolo 7\. Dopo il login si arriva alla home, con tre azioni principali da cui si diramano tre percorsi indipendenti:

* Home — "Cosa vuoi fare oggi"

  * 1\. Crea Richiesta Materiale

  * 2\. Cerca Info Materiali

  * 3\. Controlla le tue Richieste (per l'Admin: Gestisci le Richieste — vede ed evade le richieste di tutti)

*Il percorso più articolato è "Crea Richiesta Materiale", che segue un imbuto a 4 livelli (categoria → famiglia → componente → misura/quantità) descritto nel dettaglio al capitolo 4\. Un bottone "← Continua a sfogliare" accompagna l'utente in ogni schermata di questo imbuto tranne la primissima (scelta categoria), per tornare rapidamente al livello precedente senza passare dal menu breadcrumb in alto.*

# 3\. Home page

Schermata mostrata subito dopo il login. Elementi:

* Intestazione con logo Fabtek su barra blu navy (identità visiva aziendale), nome dell'utente collegato e relativo ruolo, bottone per uscire (logout).

* Saluto personalizzato: "Ciao \[Nome utente\]".

* Titolo: "Cosa vuoi fare oggi".

* Tre riquadri grandi, con foto di sfondo e overlay scuro semi-trasparente, testo bianco maiuscolo centrato:

  * CREA RICHIESTA MATERIALE

  * CERCA INFO MATERIALI

  * CONTROLLA LE TUE RICHIESTE ("GESTISCI LE RICHIESTE" per l'Admin)

*Nessun altro elemento in home: l'app resta intenzionalmente minimale, tre porte d'ingresso e basta.*

# 4\. Flusso 1 — Crea Richiesta Materiale

## 4.1 Dati della richiesta (obbligatori)

Cliccando "Crea Richiesta Materiale" si apre un primo modulo con i dati di intestazione della richiesta, da compilare prima di poter scegliere il materiale. Il bottone in fondo ("Crea richiesta e seleziona il materiale") resta disabilitato finché i campi obbligatori non sono compilati.

| Campo | Note |
| :---- | :---- |
| **Richiedente** | Obbligatorio — precompilato con l'utente autenticato al login |
| **Data richiesta** | Obbligatorio — precompilata con la data odierna |
| **Progetto \#** | Obbligatorio — numero commessa/progetto |
| **Tool / Line \#** | Obbligatorio — riferimento macchina o linea |
| **Utilities** | Obbligatorio — utility di impianto interessata |
| **Materiale** | Compilato automaticamente in base alla categoria scelta al passo successivo |
| **Categoria** | Compilata automaticamente in base alla categoria scelta al passo successivo |
| **Altro** | Facoltativo — note libere |

## 4.2 Selezione categoria (14 categorie)

Superato il modulo dati, si apre la griglia delle categorie di materiale, a riquadri cliccabili nello stesso stile della home. È l'unica schermata dell'imbuto senza il bottone "Continua a sfogliare", perché è già il primo livello:

| PV — Process Vacuum | Standard Gas (\<25ra) |
| :---- | :---- |
| UHP Gases (\<10ra) | Special Coax Gases (Coaxial) |
| PCW — Process Cooling Water | SW — Soft Water |
| Exhaust | DIW — UHP Water |
| DRAIN — Waste | Chemicals |
| VDM — Vuoto di Macchina | LIM |
| Clean Room | Other Generals |

## 4.3 Selezione famiglia (8 famiglie)

Scelta la categoria, si apre una seconda griglia con le famiglie di prodotto disponibili in quella categoria:

| Tubo | Fitting | Valvole | Riduttori di pressione |
| :---- | :---- | :---- | :---- |
| Raccordi | Guarnizioni | Accessori | Altro |

## 4.4 Elenco componenti

Scelta la famiglia, si apre l'elenco dei componenti di quella famiglia, a riquadri con foto (nella versione attuale, 10 componenti segnaposto: la lista reale verrà caricata dal catalogo/database quando l'app sarà collegata al magazzino).

| Item 1 (placeholder) | Item 2 (placeholder) | Item 3 (placeholder) | Item 4 (placeholder) | Item 5 (placeholder) |
| :---- | :---- | :---- | :---- | :---- |
| Item 6 (placeholder) | Item 7 (placeholder) | Item 8 (placeholder) | Item 9 (placeholder) | Item 10 (placeholder) |

## 4.5 Dettaglio componente: misure, disponibilità e quantità

Cliccando su un componente si apre una scheda con l'elenco delle varianti/misure disponibili per quel componente (una riga per misura), in stile tabella tecnica — coerente con le schede prodotto già in uso (es. le tabelle Swagelok mostrate come riferimento). Per ogni riga:

* Codice / Part \# della misura specifica

* Caratteristiche tecniche (dimensioni, materiale, tipo di connessione, ecc. — variano per famiglia)

* Disponibilità a magazzino, sempre visibile: numero di pezzi presenti, con evidenza quando la scorta è bassa o esaurita — la stessa informazione mostrata anche nel flusso di sola ricerca (capitolo 5\)

* Campo quantità con contatore \+/- che parte sempre da zero (mai precompilato a 1), e bottone "Aggiungi alla richiesta" — il sistema impedisce di aggiungere un articolo con quantità zero

* Bottone "Data Sheet" per consultare la scheda tecnica del produttore

Ogni articolo aggiunto entra nella richiesta in corso; si può tornare indietro con "Continua a sfogliare" (categoria, famiglia, o elenco componenti) e aggiungere altri componenti prima di chiudere la richiesta, in stile carrello — il conteggio articoli e il tasto "Vai al riepilogo" restano visibili in fondo a tutte le schermate dell'imbuto.

## 4.6 Invio della richiesta

Quando l'utente ha aggiunto tutti gli articoli che gli servono, apre il riepilogo, controlla le righe e invia la richiesta. La richiesta — intestazione (§4.1) \+ righe articolo (§4.5) — viene inviata automaticamente al magazzino, senza ulteriori passaggi manuali, con stato iniziale "In preparazione" (vocabolario di stato completo al capitolo 6).

## 4.7 Stampa della richiesta (PDF)

Nella schermata di riepilogo, accanto al bottone di invio, un bottone "Stampa richiesta (PDF)" apre l'anteprima di stampa del browser con una distinta pulita e completa di tutti gli articoli aggiunti — Part \#, categoria, famiglia, componente, misura, materiale, connessione e quantità — oltre ai dati di intestazione della richiesta. Da lì si stampa su carta o si salva come PDF, utile per allegare la richiesta a un'email o conservarla insieme alla documentazione di commessa.

# 5\. Flusso 2 — Cerca Info Materiali

Percorso di sola consultazione, per chi vuole informarsi su un materiale senza creare una richiesta. Riusa la stessa struttura a imbuto categoria → famiglia → componente → misura, con due differenze:

* Il modulo iniziale è di ricerca/filtro (non richiede i dati di intestazione richiesta — niente Progetto \#, Tool/Line \#, ecc. — si può anche cercare per testo libero oltre che per categoria).

* Nella scheda finale del componente non compare il campo quantità né "Aggiungi alla richiesta": solo consultazione di caratteristiche tecniche, disponibilità a magazzino (stesso formato del flusso di richiesta, §4.5) e Data Sheet.

*Proposta da validare con Andrea: se utile, da qui si può comunque passare a "Aggiungi alla richiesta" per non dover ripetere la ricerca — da confermare nella revisione di questo documento.*

# 6\. Flusso 3 — Controlla/Gestisci le Richieste

Il contenuto di questa schermata dipende dal livello dell'utente collegato (capitolo 7).

## 6.1 Vista User — "Controlla le tue Richieste"

Elenco delle sole richieste inviate dall'utente collegato, più recenti in alto:

| Data richiesta | Progetto \# | N° articoli | Stato |
| :---- | :---- | :---- | :---- |

Cliccando su una richiesta si apre il dettaglio in sola lettura con tutte le righe articolo e, per ciascuna, quanto è stato evaso rispetto al richiesto.

## 6.2 Vista Admin — "Gestisci le Richieste"

Stesso elenco ma esteso a tutte le richieste di tutti gli utenti (colonna aggiuntiva "Richiedente"). Aprendo una richiesta, l'Admin vede in più, per ogni riga articolo, un campo quantità con contatore \+/- che parte sempre da zero e un bottone "Evadi": inserendo una quantità (anche parziale rispetto al richiesto) e confermando, quella quantità si somma all'evaso della riga — stessa logica di riserva/evasione già in uso nel magazzino nativo, qui esposta articolo per articolo invece che a livello di intera richiesta.

## 6.3 Stato della richiesta

Lo stato di ogni riga (e della richiesta nel suo complesso, calcolato dalla combinazione delle righe) segue tre valori:

| In preparazione — nessuna quantità ancora evasa | Evasa parziale — evaso più di zero ma meno del richiesto | Evasa — evaso tutto il richiesto |
| :---- | :---- | :---- |

# 7\. Accesso e livelli utente — Login, Admin e User

L'app si apre sempre su una pagina di login (utente e password); non esiste un modo per usarla senza autenticarsi. In base alle credenziali inserite, il sistema riconosce automaticamente il livello dell'utente e mostra l'interfaccia corrispondente — non è l'utente a scegliere il proprio ruolo.

## 7.1 Livello User (Richiedente)

* Crea richieste di materiale (Flusso 1, capitolo 4).

* Cerca informazioni sui materiali (Flusso 2, capitolo 5).

* Verifica lo stato delle proprie richieste già inviate (§6.1).

## 7.2 Livello Admin (Magazzino)

L'Admin eredita tutte le funzioni dello User, più:

* Gestione del catalogo: può modificare nome e sottotitolo di ogni categoria, famiglia e componente esistente (icona di modifica su ogni riquadro), ed aggiungerne di nuovi tramite un riquadro "Aggiungi" — stesso formato grafico degli altri riquadri, con icona "+" al posto della foto — presente in fondo alle griglie di categorie, famiglie e componenti. Può anche eliminare una voce.

* Gestione delle richieste di tutti gli utenti, con evasione riga per riga e quantità parziali (§6.2).

*Nel prototipo cliccabile, due utenti demo permettono di validare entrambi i livelli: "admin" (Admin — Magazzino) e "mrossi" (User — Richiedente), con le stesse credenziali già in uso nell'app nativa Windows.*

# 8\. Stile visivo di riferimento

Basato sugli screenshot di esempio forniti (sito/cataloghi Fabtek esistenti):

| Colore | Codice | Uso |
| :---- | :---- | :---- |
|  | \#0B2545 | Barra intestazione, riquadri categoria, celle di titolo tabella |
|  | \#D9E8F7 | Righe alternate nelle tabelle dati |
|  | \#FFFFFF | Sfondo pagina, righe alternate tabelle |
|  | \#F2F2F2 | Sfondo secondario / divisori |

* Intestazione fissa in alto: logo Fabtek su sfondo bianco, sotto una barra piena blu navy.

* Riquadri di navigazione (home, categorie, famiglie, componenti): foto a piena larghezza con overlay scuro trasparente e didascalia bianca maiuscola centrata, in griglia responsive.

* Moduli dati e ricerca: tabella a due colonne, etichetta a sinistra, campo a destra, righe alternate azzurro chiaro/bianco — coerente con i moduli "Richiesta Materiale" e "Ricerca Materiale" già mostrati.

* Bottoni principali: rettangolari, bordo nero, testo nero in grassetto centrato, sfondo bianco/trasparente — stile essenziale, coerente con "Crea richiesta e seleziona il materiale" e "Aggiungi alla richiesta" degli esempi.

* Font: sans-serif (tipo Calibri/Segoe), titoli in grassetto, impaginazione essenziale senza elementi decorativi superflui.

# 9\. Relazione con l'app nativa Windows già costruita

Il database e la logica di riserva/magazzino (server in C, protocollo di rete, riserva automatica su commessa, evasione al carico merce) restano quelli già realizzati e testati in "Fabtek Materiali". Per collegare questo nuovo flusso serve:

* Aggiungere al catalogo componenti due nuovi campi di classificazione: Categoria (14 valori) e Famiglia (8 valori) — oggi il catalogo ha Facility/Tipologia/Materiale, concettualmente simili ma da riallineare a questa nuova classificazione.

* Sostituire la ricerca a filtri con la navigazione a riquadri (categoria → famiglia → componente → misura) come interfaccia principale per chi crea una richiesta o cerca informazioni, con disponibilità a magazzino sempre visibile.

* Il carrello/richiesta multi-articolo con riserva automatica è già stato costruito e verificato nell'app nativa: la nuova interfaccia userà la stessa logica lato server, cambia solo il modo in cui l'utente arriva a scegliere i componenti.

* Login e ruoli Admin/User: l'app nativa ha già utenti con ruolo Magazzino/Richiedente e relativo controllo lato server (le stesse funzioni riservate — scorte basse, carica merce, gestione utenti — seguono già questa distinzione); va allineata la terminologia e va aggiunta la gestione a riquadri di categorie/famiglie/componenti oggi non presente nel client nativo.

* "Controlla/Gestisci le richieste" riusa i dati già presenti (tabella richieste/riserve): serve una nuova schermata di elenco/dettaglio per l'utente, e l'estensione della schermata già esistente di evasione richieste per farla lavorare articolo per articolo invece che sull'intera richiesta.

# 10\. Stato di avanzamento e prossimi passi

* Fatto: documento di specifica e prototipo cliccabile (pagina web navigabile, senza dati reali collegati, login demo incluso) realizzati e condivisi per la revisione — comprendono tutti i flussi descritti in questo documento, inclusi login, ruoli Admin/User, gestione catalogo, evasione richieste e stampa PDF.

* Da fare: revisione del prototipo con Andrea e con un secondo utente di prova, per confermare le 14 categorie, le 8 famiglie, e le proposte ancora aperte (flusso di ricerca, colonne di "Controlla le tue richieste").

* Una volta validato il flusso sul prototipo, implementazione nell'app nativa Windows: nuovi campi Categoria/Famiglia nel database, nuova interfaccia a riquadri nel client, gestione catalogo e evasione articolo per articolo lato Admin, riuso della logica di richiesta/riserva già esistente.