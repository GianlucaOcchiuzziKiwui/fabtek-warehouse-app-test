begin;

alter table public.categories
add column icon_key text not null default 'factory';

alter table public.families
add column icon_key text not null default 'boxes';

alter table public.components
add column icon_key text not null default 'component';

alter table public.categories
add constraint categories_icon_key_check check (
  icon_key = any (array[
    'boxes', 'cable', 'circle-dot', 'circle-gauge', 'component', 'cylinder',
    'droplets', 'factory', 'flask-conical', 'gauge', 'git-branch',
    'package-search', 'plug', 'snowflake', 'sparkles', 'waves', 'wind', 'wrench'
  ]::text[])
);

alter table public.families
add constraint families_icon_key_check check (
  icon_key = any (array[
    'boxes', 'cable', 'circle-dot', 'circle-gauge', 'component', 'cylinder',
    'droplets', 'factory', 'flask-conical', 'gauge', 'git-branch',
    'package-search', 'plug', 'snowflake', 'sparkles', 'waves', 'wind', 'wrench'
  ]::text[])
);

alter table public.components
add constraint components_icon_key_check check (
  icon_key = any (array[
    'boxes', 'cable', 'circle-dot', 'circle-gauge', 'component', 'cylinder',
    'droplets', 'factory', 'flask-conical', 'gauge', 'git-branch',
    'package-search', 'plug', 'snowflake', 'sparkles', 'waves', 'wind', 'wrench'
  ]::text[])
);

update public.categories
set icon_key = case upper(code::text)
  when 'PV' then 'gauge'
  when 'STANDARD_GAS' then 'cylinder'
  when 'UHP_GASES' then 'cylinder'
  when 'SPECIAL_COAX_GASES' then 'circle-gauge'
  when 'PCW' then 'snowflake'
  when 'SW' then 'droplets'
  when 'EXHAUST' then 'wind'
  when 'DIW' then 'droplets'
  when 'DRAIN' then 'waves'
  when 'CHEMICALS' then 'flask-conical'
  when 'VDM' then 'gauge'
  when 'CLEAN_ROOM' then 'sparkles'
  else 'factory'
end;

update public.families
set icon_key = case upper(coalesce(source_code::text, ''))
  when 'TUBO' then 'cable'
  when 'FITTING' then 'git-branch'
  when 'VALVE' then 'wrench'
  when 'PRESSURE REGULATOR' then 'gauge'
  when 'FLESSIBILI' then 'cable'
  when 'INSTRUMENT' then 'circle-gauge'
  when 'RACCORDI' then 'git-branch'
  when 'GUARNIZIONI' then 'circle-dot'
  else 'boxes'
end;

update public.components
set icon_key = case
  when lower(name) ~ 'valvol' then 'wrench'
  when lower(name) ~ 'pression' then 'gauge'
  when lower(name) ~ 'tubo|flessibil' then 'cable'
  when lower(name) ~ 'fitting|raccord' then 'git-branch'
  when lower(name) ~ 'elettr|automat' then 'plug'
  when lower(name) ~ 'strument|instrument' then 'circle-gauge'
  else 'component'
end;

comment on column public.categories.icon_key is
  'Application-controlled icon key mapped to lucide-react; raw SVG is never stored.';
comment on column public.families.icon_key is
  'Application-controlled icon key mapped to lucide-react; raw SVG is never stored.';
comment on column public.components.icon_key is
  'Application-controlled icon key mapped to lucide-react; raw SVG is never stored.';

commit;
