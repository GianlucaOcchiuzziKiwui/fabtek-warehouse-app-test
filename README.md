# Fabtek Materiali

Applicazione Next.js per la gestione delle richieste materiali Fabtek, con
autenticazione e persistenza basate su Supabase.

## Avvio locale

Configura `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Installa le dipendenze e avvia l'applicazione:

```bash
npm install
npm run dev
```

## Comandi

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Le migration e il seed locale sono versionati nella directory `supabase/`.
