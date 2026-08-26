begin;

alter table public.material_request_lines
add column snapshot_line_position integer;

with ranked_lines as (
  select
    line.id,
    row_number() over (
      partition by line.request_id
      order by line.created_at, line.id
    )::integer as line_position
  from public.material_request_lines line
)
update public.material_request_lines line
set snapshot_line_position = ranked.line_position
from ranked_lines ranked
where ranked.id = line.id;

alter table public.material_request_lines
alter column snapshot_line_position set not null;

alter table public.material_request_lines
add constraint material_request_lines_request_position_key
unique (request_id, snapshot_line_position);

comment on column public.material_request_lines.snapshot_line_position is
  'Immutable one-based position in the normalized idempotent submission payload.';

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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user_id::text || ':' || p_client_request_id::text,
      0
    )
  );

  select request.id, request.request_number, request.status
  into v_request_id, v_request_number, v_status
  from public.material_requests request
  where request.requester_id = v_user_id
    and request.client_request_id = p_client_request_id;

  if found then
    if exists (
      select 1
      from public.material_requests request
      where request.id = v_request_id
        and (
          request.project is distinct from btrim(p_project)
          or request.tool_line is distinct from btrim(p_tool_line)
          or request.utilities is distinct from btrim(p_utilities)
          or request.notes is distinct from nullif(btrim(p_notes), '')
        )
    ) or exists (
      select 1
      from (
        select
          element.line_position::integer as line_position,
          parsed.item_variant_id,
          parsed.category_id,
          parsed.quantity
        from jsonb_array_elements(p_lines) with ordinality
          as element(value, line_position)
        cross join lateral jsonb_to_record(element.value)
          as parsed(item_variant_id uuid, category_id uuid, quantity integer)
      ) incoming
      full join (
        select
          line.snapshot_line_position as line_position,
          line.item_variant_id,
          line.selected_category_id as category_id,
          line.requested_quantity as quantity
        from public.material_request_lines line
        where line.request_id = v_request_id
      ) stored on stored.line_position = incoming.line_position
      where incoming.line_position is null
         or stored.line_position is null
         or incoming.item_variant_id is distinct from stored.item_variant_id
         or incoming.category_id is distinct from stored.category_id
         or incoming.quantity is distinct from stored.quantity
    ) then
      raise exception using errcode = 'P0004', message = 'IDEMPOTENCY_PAYLOAD_MISMATCH';
    end if;

    return query select v_request_id, v_request_number, v_status;
    return;
  end if;

  perform variant.id
  from public.item_variants variant
  join jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
    on x.item_variant_id = variant.id
  order by variant.id
  for update of variant;

  perform inventory.item_variant_id
  from public.inventory inventory
  join public.item_variants variant
    on variant.id = inventory.item_variant_id and variant.track_inventory
  join jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
    on x.item_variant_id = inventory.item_variant_id
  order by inventory.item_variant_id
  for update of inventory;

  if (
    select count(*)
    from jsonb_to_recordset(p_lines) as x(item_variant_id uuid, category_id uuid, quantity integer)
    join public.item_variants variant on variant.id = x.item_variant_id and variant.is_active
    join public.components component on component.id = variant.component_id and component.is_active
    join public.families family on family.id = component.family_id and family.is_active
    join public.item_variant_categories variant_category
      on variant_category.item_variant_id = variant.id
      and variant_category.category_id = x.category_id
    join public.categories category on category.id = x.category_id and category.is_active
    left join public.inventory inventory on inventory.item_variant_id = variant.id
    where not variant.track_inventory
       or inventory.on_hand_quantity - inventory.reserved_quantity >= x.quantity
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
    raise exception using errcode = 'P0004', message = 'IDEMPOTENCY_PAYLOAD_MISMATCH';
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
    snapshot_track_inventory,
    snapshot_line_position,
    requested_quantity
  )
  select
    v_request_id,
    variant.id,
    category.id,
    variant.fabtek_code::text,
    variant.oracle_sapio_code::text,
    category.name,
    family.name,
    component.name,
    variant.description,
    variant.diameter,
    variant.material,
    variant.connection,
    unit.code::text,
    variant.track_inventory,
    element.line_position::integer,
    parsed.quantity
  from jsonb_array_elements(p_lines) with ordinality
    as element(value, line_position)
  cross join lateral jsonb_to_record(element.value)
    as parsed(item_variant_id uuid, category_id uuid, quantity integer)
  join public.item_variants variant on variant.id = parsed.item_variant_id
  join public.components component on component.id = variant.component_id
  join public.families family on family.id = component.family_id
  join public.categories category on category.id = parsed.category_id
  join public.units_of_measure unit on unit.id = variant.unit_of_measure_id;

  update public.inventory inventory
  set reserved_quantity = inventory.reserved_quantity + line.requested_quantity,
      updated_at = now()
  from public.material_request_lines line
  where line.request_id = v_request_id
    and line.snapshot_track_inventory
    and inventory.item_variant_id = line.item_variant_id;

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
  where line.request_id = v_request_id
    and line.snapshot_track_inventory;

  insert into public.generated_documents (request_id, document_type)
  values (v_request_id, 'initial_request');

  return query select v_request_id, v_request_number, v_status;
end;
$$;

revoke all on function public.submit_material_request(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.submit_material_request(uuid, text, text, text, text, jsonb) to authenticated;

commit;
