Il ruolo `role` già presente nell’utente Supabase (`authenticated`, `anon`, `service_role`) non è il tuo ruolo applicativo `admin`, `manager`, `user`: non devi sovrascriverlo.

Per un MVP farei così:

1. tabella `profiles` con il ruolo;
2. funzione SQL sicura per leggere il ruolo;
3. policy RLS basate su `auth.uid()` e sulla funzione.

È più semplice del sistema JWT + Auth Hook e le modifiche ai ruoli hanno effetto immediato.

## 1. Crea ruoli e profili

```sql
create type public.app_role as enum (
  'admin',
  'manager',
  'user'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
```

## 2. Crea automaticamente il profilo

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    'user'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
```

Ogni nuovo utente partirà quindi come `user`.

## 3. Funzione per controllare il ruolo

```sql
create or replace function public.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = required_role
  );
$$;
```

Rimuovi l’accesso diretto alla funzione dai ruoli pubblici e concedilo solo agli autenticati:

```sql
revoke all on function public.has_role(public.app_role) from public;
grant execute on function public.has_role(public.app_role) to authenticated;
```

## 4. Proteggi `profiles`

Un utente può leggere solo il proprio profilo:

```sql
create policy "Utente legge il proprio profilo"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
);
```

Un admin può leggere tutti i profili:

```sql
create policy "Admin legge tutti i profili"
on public.profiles
for select
to authenticated
using (
  public.has_role('admin')
);
```

Attenzione all’update: non permettere all’utente di aggiornare liberamente tutta la riga, altrimenti potrebbe cambiarsi `role`.

Meglio concedere l’aggiornamento solo sulle colonne consentite:

```sql
grant update (full_name)
on public.profiles
to authenticated;
```

```sql
create policy "Utente modifica il proprio profilo"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
);
```

## 5. Applica i ruoli alle tabelle

Supponiamo di avere:

```sql
create table public.projects (
  id bigint generated always as identity primary key,
  name text not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;
```

### Utente: vede i propri progetti

```sql
create policy "Utente legge i propri progetti"
on public.projects
for select
to authenticated
using (
  owner_id = (select auth.uid())
);
```

### Manager: vede tutti i progetti

```sql
create policy "Manager legge tutti i progetti"
on public.projects
for select
to authenticated
using (
  public.has_role('manager')
);
```

### Admin: può fare tutto

```sql
create policy "Admin gestisce tutti i progetti"
on public.projects
for all
to authenticated
using (
  public.has_role('admin')
)
with check (
  public.has_role('admin')
);
```

Le policy permissive vengono combinate con `OR`: un utente passa se almeno una policy consente l’operazione.

## 6. Assegnare un ruolo

Da SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = 'UUID-UTENTE';
```

Oppure dal backend usando la secret key/service role. Mai permettere questa operazione direttamente dal frontend.

