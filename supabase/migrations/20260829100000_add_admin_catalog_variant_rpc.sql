begin;

alter table public.item_variants
add column sort_order integer not null default 0;

create index item_variants_component_sort_code_idx
on public.item_variants (component_id, sort_order, fabtek_code);

create function public.save_catalog_variant(
  p_id uuid,
  p_component_id uuid,
  p_fabtek_code text,
  p_oracle_sapio_code text,
  p_description text,
  p_diameter text,
  p_material text,
  p_connection text,
  p_unit_of_measure_id uuid,
  p_category_ids uuid[],
  p_track_inventory boolean,
  p_sort_order integer,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_variant_id uuid;
begin
  if v_user_id is null
     or not public.is_active_user()
     or not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if p_category_ids is null or cardinality(p_category_ids) = 0 then
    raise exception using errcode = '22023', message = 'EMPTY_CATEGORIES';
  end if;

  if array_position(p_category_ids, null) is not null then
    raise exception using errcode = '22023', message = 'INVALID_CATEGORIES';
  end if;

  if cardinality(p_category_ids) <> (
    select count(distinct category_id)::integer
    from unnest(p_category_ids) as selected(category_id)
  ) then
    raise exception using errcode = '22023', message = 'DUPLICATE_CATEGORIES';
  end if;

  if p_id is null then
    insert into public.item_variants (
      component_id,
      fabtek_code,
      oracle_sapio_code,
      description,
      diameter,
      material,
      connection,
      unit_of_measure_id,
      track_inventory,
      sort_order,
      is_active
    )
    values (
      p_component_id,
      btrim(p_fabtek_code),
      nullif(btrim(p_oracle_sapio_code), ''),
      btrim(p_description),
      nullif(btrim(p_diameter), ''),
      btrim(p_material),
      btrim(p_connection),
      p_unit_of_measure_id,
      p_track_inventory,
      p_sort_order,
      p_is_active
    )
    returning id into v_variant_id;
  else
    select iv.id
    into v_variant_id
    from public.item_variants iv
    where iv.id = p_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'VARIANT_NOT_FOUND';
    end if;

    update public.item_variants
    set component_id = p_component_id,
        fabtek_code = btrim(p_fabtek_code),
        oracle_sapio_code = nullif(btrim(p_oracle_sapio_code), ''),
        description = btrim(p_description),
        diameter = nullif(btrim(p_diameter), ''),
        material = btrim(p_material),
        connection = btrim(p_connection),
        unit_of_measure_id = p_unit_of_measure_id,
        track_inventory = p_track_inventory,
        sort_order = p_sort_order,
        is_active = p_is_active
    where id = v_variant_id;
  end if;

  delete from public.item_variant_categories
  where item_variant_id = v_variant_id;

  insert into public.item_variant_categories (item_variant_id, category_id)
  select v_variant_id, category_id
  from unnest(p_category_ids) as selected(category_id);

  return v_variant_id;
end;
$$;

revoke all on function public.save_catalog_variant(
  uuid, uuid, text, text, text, text, text, text, uuid, uuid[], boolean, integer, boolean
) from public;
revoke all on function public.save_catalog_variant(
  uuid, uuid, text, text, text, text, text, text, uuid, uuid[], boolean, integer, boolean
) from anon;
revoke all on function public.save_catalog_variant(
  uuid, uuid, text, text, text, text, text, text, uuid, uuid[], boolean, integer, boolean
) from authenticated;

grant execute on function public.save_catalog_variant(
  uuid, uuid, text, text, text, text, text, text, uuid, uuid[], boolean, integer, boolean
) to authenticated;
grant execute on function public.save_catalog_variant(
  uuid, uuid, text, text, text, text, text, text, uuid, uuid[], boolean, integer, boolean
) to service_role;

comment on function public.save_catalog_variant(
  uuid, uuid, text, text, text, text, text, text, uuid, uuid[], boolean, integer, boolean
) is 'Atomically creates or updates an item variant and replaces its category associations for active Admin users.';

commit;
