begin;

create table public.request_fulfillment_batches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id) on delete cascade,
  idempotency_key uuid not null,
  admin_id uuid not null references auth.users(id),
  fulfilled_line_count integer not null check (fulfilled_line_count > 0),
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);

alter table public.request_fulfillment_batches enable row level security;

create or replace function public.fulfill_whole_request(
  p_request_id uuid,
  p_idempotency_key uuid
)
returns table (
  request_id uuid,
  fulfilled_line_count integer,
  request_status public.request_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_existing_request_id uuid;
  v_existing_count integer;
  v_line record;
  v_line_count integer := 0;
begin
  if v_admin_id is null or not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if p_request_id is null or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST_OR_IDEMPOTENCY_KEY';
  end if;

  perform request.id
  from public.material_requests request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REQUEST_NOT_FOUND';
  end if;

  select batch.request_id, batch.fulfilled_line_count
  into v_existing_request_id, v_existing_count
  from public.request_fulfillment_batches batch
  where batch.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_request_id <> p_request_id then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;

    return query select p_request_id, v_existing_count, 'evasa'::public.request_status;
    return;
  end if;

  perform line.id
  from public.material_request_lines line
  where line.request_id = p_request_id
  order by line.id
  for update;

  perform inventory.item_variant_id
  from public.inventory inventory
  join public.material_request_lines line
    on line.item_variant_id = inventory.item_variant_id
  where line.request_id = p_request_id
    and line.snapshot_track_inventory
  order by inventory.item_variant_id
  for update of inventory;

  if not exists (
    select 1
    from public.material_request_lines line
    where line.request_id = p_request_id
      and line.fulfilled_quantity < line.requested_quantity
  ) then
    raise exception using errcode = '22023', message = 'REQUEST_ALREADY_FULFILLED';
  end if;

  for v_line in
    select
      line.id,
      line.requested_quantity - line.fulfilled_quantity as remaining_quantity
    from public.material_request_lines line
    where line.request_id = p_request_id
      and line.fulfilled_quantity < line.requested_quantity
    order by line.id
  loop
    perform public.fulfill_request_line(
      v_line.id,
      v_line.remaining_quantity,
      md5(p_idempotency_key::text || ':' || v_line.id::text)::uuid,
      'Evasione completa richiesta'
    );
    v_line_count := v_line_count + 1;
  end loop;

  insert into public.request_fulfillment_batches (
    request_id,
    idempotency_key,
    admin_id,
    fulfilled_line_count
  ) values (
    p_request_id,
    p_idempotency_key,
    v_admin_id,
    v_line_count
  );

  return query select p_request_id, v_line_count, 'evasa'::public.request_status;
end;
$$;

revoke all on table public.request_fulfillment_batches from public, anon, authenticated;
revoke all on function public.fulfill_whole_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fulfill_whole_request(uuid, uuid) to authenticated;

commit;
