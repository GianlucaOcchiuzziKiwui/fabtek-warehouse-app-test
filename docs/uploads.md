# Caricamento file

`lib/uploads/policy.ts` definisce le destinazioni consentite, dimensioni e formati.
La destinazione `component-photo` accetta JPG/PNG fino a 2 MiB (2.097.152 byte,
indicati come 2 MB nell'interfaccia). Le firme dei file vengono controllate sul server.

`lib/uploads/server.ts` espone `uploadFile(file, purpose)` e `removeUpload(path)`.
Usa la sessione Supabase dell'utente, autorizza gli amministratori e genera nomi UUID
immutabili nel bucket privato `uploads`. Non accetta bucket o percorsi dal browser.
Per aggiungere altre destinazioni, estendere insieme policy applicative e RLS Storage.

`ImageUploadField` gestisce selezione, controllo preliminare, anteprima e rimozione;
non carica file finché il servizio chiamante non salva il form.
`saveComponentWithPhoto` coordina upload, salvataggio condizionale del riferimento
e pulizia. Un conflitto concorrente o un errore di salvataggio mantiene la vecchia
foto e rimuove il nuovo file. Se fallisce la pulizia dopo il salvataggio, restituisce
successo con avviso e registra l'errore, senza annullare l'operazione completata.

`getUploadUrl` produce URL locali per `/api/uploads`. La route verifica la sessione
e legge con RLS; le risposte sono private e non memorizzabili in cache. Le immagini
usano `next/image` con `unoptimized` per conservare l'autenticazione del browser.

Prima di pubblicare il codice applicare la migrazione
`20260907120000_add_component_photos.sql`: crea bucket/policy, aggiunge `photo_path`
ai componenti e alla risposta della RPC delle opzioni catalogo. Il bucket impone
anch'esso 2 MiB e JPG/PNG. La Server Action accetta 3 MiB di richiesta per lasciare
spazio ai campi e al multipart; il singolo file rimane limitato a 2 MiB.

Verifica su Supabase: creazione con foto, sostituzione, rimozione, eliminazione del
componente e lettura da utente attivo; un utente non amministratore non deve poter
caricare/cancellare file e una sessione anonima non deve poterli leggere.
