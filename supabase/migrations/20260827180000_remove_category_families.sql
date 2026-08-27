drop trigger if exists validate_item_variant_category_before_write
on public.item_variant_categories;

drop trigger if exists validate_component_family_before_update
on public.components;

drop trigger if exists validate_variant_component_before_update
on public.item_variants;

drop trigger if exists protect_category_family_before_change
on public.category_families;

drop function if exists public.validate_item_variant_category();
drop function if exists public.validate_component_family_change();
drop function if exists public.validate_variant_component_change();
drop function if exists public.protect_category_family_compatibility();

drop table public.category_families;
