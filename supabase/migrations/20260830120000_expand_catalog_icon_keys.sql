begin;

alter table public.categories
drop constraint categories_icon_key_check;

alter table public.families
drop constraint families_icon_key_check;

alter table public.components
drop constraint components_icon_key_check;

alter table public.categories
add constraint categories_icon_key_check check (
  icon_key = any (array[
    'bolt', 'boxes', 'cable', 'circuit-board', 'circle-dot', 'circle-gauge',
    'cog', 'component', 'cylinder', 'droplets', 'factory', 'fan', 'filter',
    'flask-conical', 'gauge', 'git-branch', 'package-search', 'pipette', 'plug',
    'shield-check', 'snowflake', 'sparkles', 'thermometer', 'waves', 'wind',
    'wrench'
  ]::text[])
);

alter table public.families
add constraint families_icon_key_check check (
  icon_key = any (array[
    'bolt', 'boxes', 'cable', 'circuit-board', 'circle-dot', 'circle-gauge',
    'cog', 'component', 'cylinder', 'droplets', 'factory', 'fan', 'filter',
    'flask-conical', 'gauge', 'git-branch', 'package-search', 'pipette', 'plug',
    'shield-check', 'snowflake', 'sparkles', 'thermometer', 'waves', 'wind',
    'wrench'
  ]::text[])
);

alter table public.components
add constraint components_icon_key_check check (
  icon_key = any (array[
    'bolt', 'boxes', 'cable', 'circuit-board', 'circle-dot', 'circle-gauge',
    'cog', 'component', 'cylinder', 'droplets', 'factory', 'fan', 'filter',
    'flask-conical', 'gauge', 'git-branch', 'package-search', 'pipette', 'plug',
    'shield-check', 'snowflake', 'sparkles', 'thermometer', 'waves', 'wind',
    'wrench'
  ]::text[])
);

commit;
