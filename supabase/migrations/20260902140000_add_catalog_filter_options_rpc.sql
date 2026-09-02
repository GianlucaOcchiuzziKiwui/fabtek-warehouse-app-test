begin;

create function public.get_catalog_filter_options(
  p_category_id uuid default null,
  p_family_id uuid default null
)
returns table (
  option_kind text,
  id uuid,
  name text,
  icon_key text
)
language sql
stable
set search_path = ''
as $$
  select options.option_kind, options.id, options.name, options.icon_key
  from (
    select
      'category'::text as option_kind,
      category.id,
      category.name,
      category.icon_key,
      category.sort_order
    from public.categories as category
    where category.is_active

    union all

    select distinct
      'family'::text as option_kind,
      family.id,
      family.name,
      family.icon_key,
      family.sort_order
    from public.item_variant_categories as association
    join public.item_variants as variant
      on variant.id = association.item_variant_id
     and variant.is_active
    join public.components as component
      on component.id = variant.component_id
     and component.is_active
    join public.families as family
      on family.id = component.family_id
     and family.is_active
    where p_category_id is not null
      and association.category_id = p_category_id

    union all

    select distinct
      'component'::text as option_kind,
      component.id,
      component.name,
      component.icon_key,
      component.sort_order
    from public.item_variant_categories as association
    join public.item_variants as variant
      on variant.id = association.item_variant_id
     and variant.is_active
    join public.components as component
      on component.id = variant.component_id
     and component.is_active
    join public.families as family
      on family.id = component.family_id
     and family.is_active
    where p_category_id is not null
      and p_family_id is not null
      and association.category_id = p_category_id
      and component.family_id = p_family_id
  ) as options
  order by options.option_kind, options.sort_order, options.name, options.id;
$$;

revoke all on function public.get_catalog_filter_options(uuid, uuid) from public;
revoke all on function public.get_catalog_filter_options(uuid, uuid) from anon;
grant execute on function public.get_catalog_filter_options(uuid, uuid) to authenticated;
grant execute on function public.get_catalog_filter_options(uuid, uuid) to service_role;

comment on function public.get_catalog_filter_options(uuid, uuid)
is 'Returns the active category, family, and component navigation options already filtered, deduplicated, and ordered in PostgreSQL.';

commit;
