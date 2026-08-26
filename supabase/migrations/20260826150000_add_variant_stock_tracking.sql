begin;

alter table public.item_variants
add column track_inventory boolean not null default false;

comment on column public.item_variants.track_inventory is
  'When false, request and fulfillment quantities do not reserve or mutate inventory.';

drop function public.get_catalog_availability();

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
  join public.item_variants iv on iv.id = i.item_variant_id and iv.track_inventory
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
    left join public.inventory i on i.item_variant_id = iv.id
    where not iv.track_inventory
       or i.on_hand_quantity - i.reserved_quantity >= x.quantity
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
  join public.item_variants iv on iv.id = x.item_variant_id and iv.track_inventory
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
  join public.item_variants iv on iv.id = line.item_variant_id and iv.track_inventory
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
  v_track_inventory boolean;
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

  select line.request_id, line.item_variant_id, iv.track_inventory, line.requested_quantity, line.fulfilled_quantity
  into v_request_id, v_item_variant_id, v_track_inventory, v_requested, v_fulfilled
  from public.material_request_lines line
  join public.item_variants iv on iv.id = line.item_variant_id
  where line.id = p_request_line_id
  for update of line;

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

  if v_track_inventory then
    perform 1
    from public.inventory
    where item_variant_id = v_item_variant_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'INVENTORY_NOT_FOUND';
    end if;
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

  if v_track_inventory then
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
  end if;

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

create function public.get_catalog_availability()
returns table (
  item_variant_id uuid,
  track_inventory boolean,
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
    iv.id,
    iv.track_inventory,
    case when iv.track_inventory then i.on_hand_quantity - i.reserved_quantity end,
    case when iv.track_inventory then i.low_stock_threshold end,
    case
      when not iv.track_inventory then 'unlimited'
      when i.item_variant_id is null then 'out_of_stock'
      when i.on_hand_quantity - i.reserved_quantity <= 0 then 'out_of_stock'
      when i.on_hand_quantity - i.reserved_quantity <= i.low_stock_threshold then 'low_stock'
      else 'available'
    end
  from public.item_variants iv
  left join public.inventory i on i.item_variant_id = iv.id
  where public.is_active_user()
    and iv.is_active;
$$;

revoke all on function public.submit_material_request(uuid, text, text, text, text, jsonb) from public;
revoke all on function public.fulfill_request_line(uuid, integer, uuid, text) from public;
revoke all on function public.get_catalog_availability() from public;

grant execute on function public.submit_material_request(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.fulfill_request_line(uuid, integer, uuid, text) to authenticated;
grant execute on function public.get_catalog_availability() to authenticated;

commit;
