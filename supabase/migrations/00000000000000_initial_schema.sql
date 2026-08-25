-- Fabtek Materiali - migration zero
-- PostgreSQL 17 / Supabase

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create type public.app_role as enum ('user', 'admin');
create type public.request_status as enum ('in_preparazione', 'evasa_parziale', 'evasa');
create type public.asset_kind as enum ('photo', 'datasheet', 'three_d_view', 'specification');
create type public.import_status as enum ('pending', 'validating', 'ready', 'published', 'failed');
create type public.issue_severity as enum ('warning', 'error');
create type public.inventory_movement_type as enum ('initial_load', 'adjustment', 'reservation', 'fulfillment', 'release');
create type public.document_type as enum ('initial_request', 'final_report');
create type public.job_status as enum ('pending', 'processing', 'completed', 'failed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  role public.app_role not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, new.id::text), '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_active_user()
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
      and is_active
  );
$$;

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
      and is_active
  );
$$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  code extensions.citext not null unique,
  name text not null check (length(btrim(name)) between 1 and 160),
  subtitle text,
  image_asset_id uuid,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.category_external_codes (
  category_id uuid not null references public.categories(id) on delete cascade,
  source_system extensions.citext not null,
  external_code extensions.citext not null,
  created_at timestamptz not null default now(),
  primary key (source_system, external_code)
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  source_code extensions.citext unique,
  name text not null check (length(btrim(name)) between 1 and 160),
  subtitle text,
  image_asset_id uuid,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index families_name_unique_ci on public.families (lower(btrim(name)));

create table public.category_families (
  category_id uuid not null references public.categories(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category_id, family_id)
);

create table public.components (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index components_family_name_unique_ci
on public.components (family_id, lower(btrim(name)));

create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  code extensions.citext not null unique,
  name text not null,
  allows_fraction boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.item_variants (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.components(id) on delete restrict,
  fabtek_code extensions.citext not null unique,
  oracle_sapio_code extensions.citext unique,
  description text not null check (length(btrim(description)) > 0),
  diameter text,
  material text not null check (length(btrim(material)) > 0),
  connection text not null check (length(btrim(connection)) > 0),
  unit_of_measure_id uuid not null references public.units_of_measure(id) on delete restrict,
  technical_attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(technical_attributes) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index item_variants_component_idx on public.item_variants (component_id);
create index item_variants_description_search_idx on public.item_variants using gin (to_tsvector('simple', description));

create table public.item_variant_categories (
  item_variant_id uuid not null references public.item_variants(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  source_system extensions.citext,
  created_at timestamptz not null default now(),
  primary key (item_variant_id, category_id)
);

create index item_variant_categories_category_idx on public.item_variant_categories (category_id, item_variant_id);

create or replace function public.validate_item_variant_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.item_variants iv
    join public.components c on c.id = iv.component_id
    join public.category_families cf
      on cf.family_id = c.family_id
     and cf.category_id = new.category_id
     and cf.is_active
    where iv.id = new.item_variant_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'CATEGORY_FAMILY_NOT_ENABLED';
  end if;

  return new;
end;
$$;

create trigger validate_item_variant_category_before_write
before insert or update on public.item_variant_categories
for each row execute function public.validate_item_variant_category();

create or replace function public.protect_category_family_compatibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
       tg_op = 'DELETE'
       or not new.is_active
       or new.category_id is distinct from old.category_id
       or new.family_id is distinct from old.family_id
     )
     and exists (
       select 1
       from public.item_variant_categories ivc
       join public.item_variants iv on iv.id = ivc.item_variant_id
       join public.components c on c.id = iv.component_id
       where ivc.category_id = old.category_id
         and c.family_id = old.family_id
     ) then
    raise exception using
      errcode = '23503',
      message = 'CATEGORY_FAMILY_IN_USE';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_category_family_before_change
before update or delete on public.category_families
for each row execute function public.protect_category_family_compatibility();

create or replace function public.validate_component_family_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.family_id is distinct from old.family_id
     and exists (
       select 1
       from public.item_variants iv
       join public.item_variant_categories ivc on ivc.item_variant_id = iv.id
       where iv.component_id = old.id
         and not exists (
           select 1
           from public.category_families cf
           where cf.category_id = ivc.category_id
             and cf.family_id = new.family_id
             and cf.is_active
         )
     ) then
    raise exception using
      errcode = '23514',
      message = 'COMPONENT_FAMILY_INCOMPATIBLE_WITH_VARIANTS';
  end if;

  return new;
end;
$$;

create trigger validate_component_family_before_update
before update of family_id on public.components
for each row execute function public.validate_component_family_change();

create or replace function public.validate_variant_component_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.component_id is distinct from old.component_id
     and exists (
       select 1
       from public.item_variant_categories ivc
       where ivc.item_variant_id = old.id
         and not exists (
           select 1
           from public.components c
           join public.category_families cf
             on cf.family_id = c.family_id
            and cf.category_id = ivc.category_id
            and cf.is_active
           where c.id = new.component_id
         )
     ) then
    raise exception using
      errcode = '23514',
      message = 'VARIANT_COMPONENT_INCOMPATIBLE_WITH_CATEGORIES';
  end if;

  return new;
end;
$$;

create trigger validate_variant_component_before_update
before update of component_id on public.item_variants
for each row execute function public.validate_variant_component_change();

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index suppliers_name_unique_ci on public.suppliers (lower(btrim(name)));

create table public.item_variant_suppliers (
  item_variant_id uuid not null references public.item_variants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_part_number text,
  is_preferred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_variant_id, supplier_id)
);

create unique index item_variant_one_preferred_supplier_idx
on public.item_variant_suppliers (item_variant_id)
where is_preferred;

create table public.product_assets (
  id uuid primary key default gen_random_uuid(),
  item_variant_id uuid not null references public.item_variants(id) on delete cascade,
  kind public.asset_kind not null,
  storage_path text,
  external_url text,
  title text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_assets_one_location check (
    (storage_path is not null and external_url is null)
    or (storage_path is null and external_url is not null)
  ),
  constraint product_assets_external_url_http check (
    external_url is null or external_url ~* '^https://'
  )
);

create index product_assets_variant_idx on public.product_assets (item_variant_id, kind, sort_order);

alter table public.categories
add constraint categories_image_asset_fk
foreign key (image_asset_id) references public.product_assets(id) on delete set null;

alter table public.families
add constraint families_image_asset_fk
foreign key (image_asset_id) references public.product_assets(id) on delete set null;

create table public.catalog_imports (
  id uuid primary key default gen_random_uuid(),
  source_system extensions.citext not null,
  file_name text not null,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-fA-F]{64}$'),
  storage_path text,
  status public.import_status not null default 'pending',
  rows_read integer not null default 0 check (rows_read >= 0),
  rows_valid integer not null default 0 check (rows_valid >= 0),
  rows_inserted integer not null default 0 check (rows_inserted >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  imported_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, file_sha256)
);

create table public.catalog_import_issues (
  id bigint generated always as identity primary key,
  catalog_import_id uuid not null references public.catalog_imports(id) on delete cascade,
  row_number integer check (row_number is null or row_number > 0),
  fabtek_code text,
  field_name text,
  severity public.issue_severity not null,
  error_code text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index catalog_import_issues_batch_idx on public.catalog_import_issues (catalog_import_id, severity);

create table public.catalog_import_rows (
  catalog_import_id uuid not null references public.catalog_imports(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null check (jsonb_typeof(raw_data) = 'object'),
  normalized_data jsonb check (normalized_data is null or jsonb_typeof(normalized_data) = 'object'),
  is_valid boolean not null default false,
  published_item_variant_id uuid references public.item_variants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (catalog_import_id, row_number)
);

create table public.inventory (
  item_variant_id uuid primary key references public.item_variants(id) on delete restrict,
  on_hand_quantity integer not null default 0 check (on_hand_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_reserved_within_on_hand check (reserved_quantity <= on_hand_quantity)
);

create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  request_number bigint generated always as identity unique,
  client_request_id uuid not null,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  project text not null check (length(btrim(project)) between 1 and 120),
  tool_line text not null check (length(btrim(tool_line)) between 1 and 120),
  utilities text not null check (length(btrim(utilities)) between 1 and 240),
  notes text,
  status public.request_status not null default 'in_preparazione',
  submitted_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, client_request_id),
  constraint material_requests_archive_pair check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  )
);

create index material_requests_requester_date_idx on public.material_requests (requester_id, requested_at desc);
create index material_requests_status_date_idx on public.material_requests (status, requested_at desc);

create table public.material_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id) on delete cascade,
  item_variant_id uuid not null references public.item_variants(id) on delete restrict,
  selected_category_id uuid not null references public.categories(id) on delete restrict,
  snapshot_fabtek_code text not null,
  snapshot_oracle_sapio_code text,
  snapshot_category_name text not null,
  snapshot_family_name text not null,
  snapshot_component_name text not null,
  snapshot_description text not null,
  snapshot_diameter text,
  snapshot_material text not null,
  snapshot_connection text not null,
  snapshot_unit_of_measure text not null,
  requested_quantity integer not null check (requested_quantity > 0),
  fulfilled_quantity integer not null default 0 check (fulfilled_quantity >= 0),
  status public.request_status not null default 'in_preparazione',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, item_variant_id),
  constraint material_request_lines_fulfilled_within_requested check (fulfilled_quantity <= requested_quantity)
);

create index material_request_lines_request_idx on public.material_request_lines (request_id);

create table public.fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  request_line_id uuid not null references public.material_request_lines(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  fulfilled_at timestamptz not null default now(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  notes text,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create index fulfillment_events_line_date_idx on public.fulfillment_events (request_line_id, fulfilled_at);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_variant_id uuid not null references public.item_variants(id) on delete restrict,
  request_id uuid references public.material_requests(id) on delete restrict,
  request_line_id uuid references public.material_request_lines(id) on delete restrict,
  movement_type public.inventory_movement_type not null,
  on_hand_delta integer not null default 0,
  reserved_delta integer not null default 0,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  constraint inventory_movements_non_zero check (on_hand_delta <> 0 or reserved_delta <> 0)
);

create index inventory_movements_variant_date_idx on public.inventory_movements (item_variant_id, created_at desc);
create index inventory_movements_request_idx on public.inventory_movements (request_id) where request_id is not null;

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id) on delete cascade,
  document_type public.document_type not null,
  storage_path text,
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-fA-F]{64}$'),
  template_version text not null default '1',
  status public.job_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, document_type)
);

create index generated_documents_worker_idx
on public.generated_documents (status, next_attempt_at)
where status in ('pending', 'processing');

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id) on delete cascade,
  document_id uuid not null references public.generated_documents(id) on delete cascade,
  document_type public.document_type not null,
  recipients text[] not null check (cardinality(recipients) > 0),
  subject text not null,
  status public.job_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, document_type)
);

create index notification_jobs_worker_idx
on public.notification_jobs (status, next_attempt_at)
where status in ('pending', 'processing');

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_events_resource_idx on public.audit_events (resource_type, resource_id, created_at desc);
create index audit_events_actor_idx on public.audit_events (actor_id, created_at desc);

create or replace function public.submit_material_request(
  p_client_request_id uuid,
  p_project text,
  p_tool_line text,
  p_utilities text,
  p_notes text,
  p_lines jsonb
)
returns table (request_id uuid, request_number bigint, status public.request_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_id uuid;
  v_request_number bigint;
  v_status public.request_status;
  v_line_count integer;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if p_client_request_id is null
     or nullif(btrim(p_project), '') is null
     or nullif(btrim(p_tool_line), '') is null
     or nullif(btrim(p_utilities), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST_HEADER';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'EMPTY_REQUEST';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) element
    where jsonb_typeof(element) <> 'object'
       or jsonb_typeof(element -> 'quantity') <> 'number'
       or coalesce(element ->> 'quantity', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST_LINES';
  end if;

  select mr.id, mr.request_number, mr.status
  into v_request_id, v_request_number, v_status
  from public.material_requests mr
  where mr.requester_id = v_user_id
    and mr.client_request_id = p_client_request_id;

  if found then
    return query select v_request_id, v_request_number, v_status;
    return;
  end if;

  begin
    with parsed as (
      select x.item_variant_id, x.category_id, x.quantity
      from jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
    )
    select count(*) into v_line_count from parsed;
  exception when others then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST_LINES';
  end;

  if v_line_count <> jsonb_array_length(p_lines)
     or exists (
       select 1
       from jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
       where x.item_variant_id is null or x.category_id is null or x.quantity is null or x.quantity <= 0
     )
     or exists (
       select 1
       from jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
       group by x.item_variant_id
       having count(*) > 1
     ) then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST_LINES';
  end if;

  perform i.item_variant_id
  from public.inventory i
  join jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
    on x.item_variant_id = i.item_variant_id
  order by i.item_variant_id
  for update of i;

  if (
    select count(*)
    from jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
    join public.item_variants iv on iv.id = x.item_variant_id and iv.is_active
    join public.components c on c.id = iv.component_id and c.is_active
    join public.families f on f.id = c.family_id and f.is_active
    join public.item_variant_categories ivc
      on ivc.item_variant_id = iv.id and ivc.category_id = x.category_id
    join public.categories cat on cat.id = x.category_id and cat.is_active
    join public.inventory i on i.item_variant_id = iv.id
    where i.on_hand_quantity - i.reserved_quantity >= x.quantity
  ) <> v_line_count then
    raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK_OR_INVALID_VARIANT';
  end if;

  insert into public.material_requests (
    client_request_id,
    requester_id,
    project,
    tool_line,
    utilities,
    notes
  )
  values (
    p_client_request_id,
    v_user_id,
    btrim(p_project),
    btrim(p_tool_line),
    btrim(p_utilities),
    nullif(btrim(p_notes), '')
  )
  on conflict (requester_id, client_request_id) do nothing
  returning id, material_requests.request_number, material_requests.status
  into v_request_id, v_request_number, v_status;

  if not found then
    return query
    select mr.id, mr.request_number, mr.status
    from public.material_requests mr
    where mr.requester_id = v_user_id
      and mr.client_request_id = p_client_request_id;
    return;
  end if;

  insert into public.material_request_lines (
    request_id,
    item_variant_id,
    selected_category_id,
    snapshot_fabtek_code,
    snapshot_oracle_sapio_code,
    snapshot_category_name,
    snapshot_family_name,
    snapshot_component_name,
    snapshot_description,
    snapshot_diameter,
    snapshot_material,
    snapshot_connection,
    snapshot_unit_of_measure,
    requested_quantity
  )
  select
    v_request_id,
    iv.id,
    cat.id,
    iv.fabtek_code::text,
    iv.oracle_sapio_code::text,
    cat.name,
    f.name,
    c.name,
    iv.description,
    iv.diameter,
    iv.material,
    iv.connection,
    uom.code::text,
    x.quantity
  from jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
  join public.item_variants iv on iv.id = x.item_variant_id
  join public.components c on c.id = iv.component_id
  join public.families f on f.id = c.family_id
  join public.categories cat on cat.id = x.category_id
  join public.units_of_measure uom on uom.id = iv.unit_of_measure_id;

  update public.inventory i
  set reserved_quantity = i.reserved_quantity + x.quantity,
      updated_at = now()
  from jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
  where i.item_variant_id = x.item_variant_id;

  insert into public.inventory_movements (
    item_variant_id,
    request_id,
    request_line_id,
    movement_type,
    reserved_delta,
    actor_id
  )
  select
    line.item_variant_id,
    v_request_id,
    line.id,
    'reservation',
    line.requested_quantity,
    v_user_id
  from public.material_request_lines line
  where line.request_id = v_request_id;

  insert into public.generated_documents (request_id, document_type)
  values (v_request_id, 'initial_request');

  return query select v_request_id, v_request_number, v_status;
end;
$$;

create or replace function public.fulfill_request_line(
  p_request_line_id uuid,
  p_quantity integer,
  p_idempotency_key uuid,
  p_notes text default null
)
returns table (
  request_id uuid,
  request_line_id uuid,
  fulfilled_quantity integer,
  remaining_quantity integer,
  line_status public.request_status,
  request_status public.request_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_request_id uuid;
  v_item_variant_id uuid;
  v_requested integer;
  v_fulfilled integer;
  v_line_status public.request_status;
  v_request_status public.request_status;
  v_existing_event_line_id uuid;
begin
  if v_admin_id is null or not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'INVALID_QUANTITY_OR_IDEMPOTENCY_KEY';
  end if;

  select line.request_id, line.item_variant_id, line.requested_quantity, line.fulfilled_quantity
  into v_request_id, v_item_variant_id, v_requested, v_fulfilled
  from public.material_request_lines line
  where line.id = p_request_line_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REQUEST_LINE_NOT_FOUND';
  end if;

  select event.request_line_id
  into v_existing_event_line_id
  from public.fulfillment_events event
  where event.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_event_line_id <> p_request_line_id then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;

    select line.status, mr.status
    into v_line_status, v_request_status
    from public.material_request_lines line
    join public.material_requests mr on mr.id = line.request_id
    where line.id = p_request_line_id;

    return query
    select v_request_id, p_request_line_id, v_fulfilled, v_requested - v_fulfilled, v_line_status, v_request_status;
    return;
  end if;

  if p_quantity > v_requested - v_fulfilled then
    raise exception using errcode = '22023', message = 'QUANTITY_EXCEEDS_REMAINING';
  end if;

  perform 1
  from public.inventory
  where item_variant_id = v_item_variant_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'INVENTORY_NOT_FOUND';
  end if;

  insert into public.fulfillment_events (
    request_line_id,
    quantity,
    admin_id,
    notes,
    idempotency_key
  ) values (
    p_request_line_id,
    p_quantity,
    v_admin_id,
    nullif(btrim(p_notes), ''),
    p_idempotency_key
  );

  v_fulfilled := v_fulfilled + p_quantity;
  v_line_status := case
    when v_fulfilled = v_requested then 'evasa'::public.request_status
    else 'evasa_parziale'::public.request_status
  end;

  update public.material_request_lines
  set fulfilled_quantity = v_fulfilled,
      status = v_line_status,
      updated_at = now()
  where id = p_request_line_id;

  update public.inventory
  set on_hand_quantity = on_hand_quantity - p_quantity,
      reserved_quantity = reserved_quantity - p_quantity,
      updated_at = now()
  where item_variant_id = v_item_variant_id
    and on_hand_quantity >= p_quantity
    and reserved_quantity >= p_quantity;

  if not found then
    raise exception using errcode = '23514', message = 'INVENTORY_INVARIANT_VIOLATION';
  end if;

  insert into public.inventory_movements (
    item_variant_id,
    request_id,
    request_line_id,
    movement_type,
    on_hand_delta,
    reserved_delta,
    actor_id,
    notes
  ) values (
    v_item_variant_id,
    v_request_id,
    p_request_line_id,
    'fulfillment',
    -p_quantity,
    -p_quantity,
    v_admin_id,
    nullif(btrim(p_notes), '')
  );

  select case
    when bool_and(line.status = 'evasa') then 'evasa'::public.request_status
    when bool_or(line.status <> 'in_preparazione') then 'evasa_parziale'::public.request_status
    else 'in_preparazione'::public.request_status
  end
  into v_request_status
  from public.material_request_lines line
  where line.request_id = v_request_id;

  update public.material_requests
  set status = v_request_status,
      updated_at = now()
  where id = v_request_id;

  if v_request_status = 'evasa' then
    insert into public.generated_documents (request_id, document_type)
    values (v_request_id, 'final_report')
    on conflict on constraint generated_documents_request_id_document_type_key do nothing;
  end if;

  return query
  select v_request_id, p_request_line_id, v_fulfilled, v_requested - v_fulfilled, v_line_status, v_request_status;
end;
$$;

create or replace function public.get_catalog_availability()
returns table (
  item_variant_id uuid,
  available_quantity integer,
  low_stock_threshold integer,
  stock_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.item_variant_id,
    i.on_hand_quantity - i.reserved_quantity,
    i.low_stock_threshold,
    case
      when i.on_hand_quantity - i.reserved_quantity <= 0 then 'out_of_stock'
      when i.on_hand_quantity - i.reserved_quantity <= i.low_stock_threshold then 'low_stock'
      else 'available'
    end
  from public.inventory i
  join public.item_variants iv on iv.id = i.item_variant_id
  where public.is_active_user()
    and iv.is_active;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();
create trigger families_set_updated_at before update on public.families
for each row execute function public.set_updated_at();
create trigger category_families_set_updated_at before update on public.category_families
for each row execute function public.set_updated_at();
create trigger components_set_updated_at before update on public.components
for each row execute function public.set_updated_at();
create trigger units_of_measure_set_updated_at before update on public.units_of_measure
for each row execute function public.set_updated_at();
create trigger item_variants_set_updated_at before update on public.item_variants
for each row execute function public.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();
create trigger item_variant_suppliers_set_updated_at before update on public.item_variant_suppliers
for each row execute function public.set_updated_at();
create trigger product_assets_set_updated_at before update on public.product_assets
for each row execute function public.set_updated_at();
create trigger catalog_imports_set_updated_at before update on public.catalog_imports
for each row execute function public.set_updated_at();
create trigger catalog_import_rows_set_updated_at before update on public.catalog_import_rows
for each row execute function public.set_updated_at();
create trigger inventory_set_updated_at before update on public.inventory
for each row execute function public.set_updated_at();
create trigger material_requests_set_updated_at before update on public.material_requests
for each row execute function public.set_updated_at();
create trigger material_request_lines_set_updated_at before update on public.material_request_lines
for each row execute function public.set_updated_at();
create trigger generated_documents_set_updated_at before update on public.generated_documents
for each row execute function public.set_updated_at();
create trigger notification_jobs_set_updated_at before update on public.notification_jobs
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.category_external_codes enable row level security;
alter table public.families enable row level security;
alter table public.category_families enable row level security;
alter table public.components enable row level security;
alter table public.units_of_measure enable row level security;
alter table public.item_variants enable row level security;
alter table public.item_variant_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.item_variant_suppliers enable row level security;
alter table public.product_assets enable row level security;
alter table public.catalog_imports enable row level security;
alter table public.catalog_import_issues enable row level security;
alter table public.catalog_import_rows enable row level security;
alter table public.inventory enable row level security;
alter table public.material_requests enable row level security;
alter table public.material_request_lines enable row level security;
alter table public.fulfillment_events enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.generated_documents enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_own_or_admin on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.has_role('admin'));

create policy profiles_update_own on public.profiles
for update to authenticated
using (id = (select auth.uid()) and public.is_active_user())
with check (id = (select auth.uid()) and public.is_active_user());

create policy profiles_admin_update on public.profiles
for update to authenticated
using (public.has_role('admin'))
with check (public.has_role('admin'));

create policy categories_read_active on public.categories
for select to authenticated
using (public.is_active_user() and (is_active or public.has_role('admin')));
create policy categories_admin_write on public.categories
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy category_external_codes_read on public.category_external_codes
for select to authenticated
using (public.is_active_user());
create policy category_external_codes_admin_write on public.category_external_codes
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy families_read_active on public.families
for select to authenticated
using (public.is_active_user() and (is_active or public.has_role('admin')));
create policy families_admin_write on public.families
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy category_families_read_active on public.category_families
for select to authenticated
using (public.is_active_user() and (is_active or public.has_role('admin')));
create policy category_families_admin_write on public.category_families
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy components_read_active on public.components
for select to authenticated
using (public.is_active_user() and (is_active or public.has_role('admin')));
create policy components_admin_write on public.components
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy units_of_measure_read_active on public.units_of_measure
for select to authenticated
using (public.is_active_user() and (is_active or public.has_role('admin')));
create policy units_of_measure_admin_write on public.units_of_measure
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy item_variants_read_active on public.item_variants
for select to authenticated
using (public.is_active_user() and (is_active or public.has_role('admin')));
create policy item_variants_admin_write on public.item_variants
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy item_variant_categories_read on public.item_variant_categories
for select to authenticated
using (public.is_active_user());
create policy item_variant_categories_admin_write on public.item_variant_categories
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy suppliers_read_active on public.suppliers
for select to authenticated
using (public.is_active_user() and (is_active or public.has_role('admin')));
create policy suppliers_admin_write on public.suppliers
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy item_variant_suppliers_read on public.item_variant_suppliers
for select to authenticated
using (public.is_active_user());
create policy item_variant_suppliers_admin_write on public.item_variant_suppliers
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy product_assets_read_active on public.product_assets
for select to authenticated
using (public.is_active_user() and (is_active or public.has_role('admin')));
create policy product_assets_admin_write on public.product_assets
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy catalog_imports_admin_all on public.catalog_imports
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));
create policy catalog_import_issues_admin_all on public.catalog_import_issues
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));
create policy catalog_import_rows_admin_all on public.catalog_import_rows
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));
create policy inventory_admin_all on public.inventory
for all to authenticated
using (public.has_role('admin')) with check (public.has_role('admin'));

create policy material_requests_select_own_or_admin on public.material_requests
for select to authenticated
using (requester_id = (select auth.uid()) or public.has_role('admin'));

create policy material_request_lines_select_own_or_admin on public.material_request_lines
for select to authenticated
using (
  exists (
    select 1 from public.material_requests mr
    where mr.id = request_id
      and (mr.requester_id = (select auth.uid()) or public.has_role('admin'))
  )
);

create policy fulfillment_events_select_own_or_admin on public.fulfillment_events
for select to authenticated
using (
  exists (
    select 1
    from public.material_request_lines line
    join public.material_requests mr on mr.id = line.request_id
    where line.id = request_line_id
      and (mr.requester_id = (select auth.uid()) or public.has_role('admin'))
  )
);

create policy inventory_movements_admin_select on public.inventory_movements
for select to authenticated
using (public.has_role('admin'));

create policy generated_documents_select_own_or_admin on public.generated_documents
for select to authenticated
using (
  exists (
    select 1 from public.material_requests mr
    where mr.id = request_id
      and (mr.requester_id = (select auth.uid()) or public.has_role('admin'))
  )
);

create policy notification_jobs_admin_select on public.notification_jobs
for select to authenticated
using (public.has_role('admin'));

create policy audit_events_admin_select on public.audit_events
for select to authenticated
using (public.has_role('admin'));

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.has_role(public.app_role) from public;
revoke all on function public.validate_item_variant_category() from public;
revoke all on function public.protect_category_family_compatibility() from public;
revoke all on function public.validate_component_family_change() from public;
revoke all on function public.validate_variant_component_change() from public;
revoke all on function public.submit_material_request(uuid, text, text, text, text, jsonb) from public;
revoke all on function public.fulfill_request_line(uuid, integer, uuid, text) from public;
revoke all on function public.get_catalog_availability() from public;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

grant select, insert, update, delete on
  public.categories,
  public.category_external_codes,
  public.families,
  public.category_families,
  public.components,
  public.units_of_measure,
  public.item_variants,
  public.item_variant_categories,
  public.suppliers,
  public.item_variant_suppliers,
  public.product_assets
to authenticated;

grant select, insert, update, delete on
  public.catalog_imports,
  public.catalog_import_issues,
  public.catalog_import_rows,
  public.inventory
to authenticated;

grant select on
  public.material_requests,
  public.material_request_lines,
  public.fulfillment_events,
  public.inventory_movements,
  public.generated_documents,
  public.notification_jobs,
  public.audit_events
to authenticated;

grant usage, select on sequence public.catalog_import_issues_id_seq to authenticated;
grant usage, select on sequence public.audit_events_id_seq to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.submit_material_request(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.fulfill_request_line(uuid, integer, uuid, text) to authenticated;
grant execute on function public.get_catalog_availability() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('datasheets', 'datasheets', false, 52428800, array['application/pdf', 'image/png', 'image/jpeg', 'model/gltf-binary', 'model/gltf+json']),
  ('generated-documents', 'generated-documents', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy storage_datasheets_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'datasheets' and public.has_role('admin'));

create policy storage_datasheets_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'datasheets' and public.has_role('admin'))
with check (bucket_id = 'datasheets' and public.has_role('admin'));

create policy storage_datasheets_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'datasheets' and public.has_role('admin'));

create policy storage_datasheets_authenticated_select on storage.objects
for select to authenticated
using (
  bucket_id = 'datasheets'
  and public.is_active_user()
  and exists (
    select 1 from public.product_assets asset
    where asset.storage_path = name
      and asset.is_active
  )
);

create policy storage_generated_documents_select_owner_or_admin on storage.objects
for select to authenticated
using (
  bucket_id = 'generated-documents'
  and exists (
    select 1
    from public.generated_documents document
    join public.material_requests request on request.id = document.request_id
    where document.storage_path = name
      and (request.requester_id = (select auth.uid()) or public.has_role('admin'))
  )
);

comment on table public.category_external_codes is 'Maps source-specific category codes such as CSV UPW without conflating them with request utilities text.';
comment on table public.item_variant_categories is 'Many-to-many category compatibility at variant level; required by the source CSV.';
comment on function public.submit_material_request(uuid, text, text, text, text, jsonb) is 'Atomic, idempotent request submission and stock reservation RPC.';
comment on function public.fulfill_request_line(uuid, integer, uuid, text) is 'Atomic, idempotent fulfillment RPC restricted to active admins.';

commit;
