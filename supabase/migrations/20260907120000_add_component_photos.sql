begin;

alter table public.components add column photo_path text;
alter table public.components add constraint components_photo_path_format check (
  photo_path is null or photo_path ~ '^components/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
);
create unique index components_photo_path_key on public.components(photo_path) where photo_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 2097152, array['image/jpeg', 'image/png']);

create policy uploads_admin_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'uploads' and public.has_role('admin')
  and name ~ '^components/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
);

create policy uploads_read on storage.objects for select to authenticated
using (
  bucket_id = 'uploads' and public.is_active_user()
  and (
    public.has_role('admin')
    or exists (
      select 1 from public.components component
      join public.families family on family.id = component.family_id and family.is_active
      where component.photo_path = objects.name and component.is_active
    )
  )
);

-- Files are immutable. Detach a photo before deleting its storage object.
create policy uploads_admin_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'uploads' and public.has_role('admin')
  and not exists (select 1 from public.components component where component.photo_path = objects.name)
);

comment on column public.components.photo_path is 'Private uploads bucket path shared by all variants of this component.';

-- The additional return column requires recreating the existing function.
drop function public.get_catalog_filter_options(uuid, uuid);

create function public.get_catalog_filter_options(
  p_category_id uuid default null,
  p_family_id uuid default null
)
returns table (
  option_kind text,
  id uuid,
  name text,
  icon_key text,
  photo_path text
)
language sql
stable
set search_path = ''
as $$
  select options.option_kind, options.id, options.name, options.icon_key, options.photo_path
  from (
    select
      'category'::text as option_kind,
      category.id,
      category.name,
      category.icon_key,
      null::text as photo_path,
      category.sort_order
    from public.categories as category
    where category.is_active

    union all

    select distinct
      'family'::text as option_kind,
      family.id,
      family.name,
      family.icon_key,
      null::text as photo_path,
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
      component.photo_path,
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
