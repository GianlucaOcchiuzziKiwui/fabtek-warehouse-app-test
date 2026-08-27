-- Stable baseline data only. Product variants and inventory are imported separately.

insert into public.categories (code, name, icon_key, sort_order)
values
  ('PV', 'Process Vacuum', 'gauge', 10),
  ('STANDARD_GAS', 'Standard Gas (<25ra)', 'cylinder', 20),
  ('UHP_GASES', 'UHP Gases (<10ra)', 'cylinder', 30),
  ('SPECIAL_COAX_GASES', 'Special Coax Gases (Coaxial)', 'circle-gauge', 40),
  ('PCW', 'Process Cooling Water', 'snowflake', 50),
  ('SW', 'Soft Water', 'droplets', 60),
  ('EXHAUST', 'Exhaust', 'wind', 70),
  ('DIW', 'UHP Water', 'droplets', 80),
  ('DRAIN', 'Waste', 'waves', 90),
  ('CHEMICALS', 'Chemicals', 'flask-conical', 100),
  ('VDM', 'Vuoto di Macchina', 'gauge', 110),
  ('LIM', 'LIM', 'factory', 120),
  ('CLEAN_ROOM', 'Clean Room', 'sparkles', 130),
  ('OTHER_GENERALS', 'Other Generals', 'factory', 140)
on conflict (code) do update
set name = excluded.name,
    icon_key = excluded.icon_key,
    sort_order = excluded.sort_order;

insert into public.units_of_measure (code, name, allows_fraction)
values
  ('pcs', 'Pezzi', false),
  ('m', 'Metri', false)
on conflict (code) do update
set name = excluded.name,
    allows_fraction = excluded.allows_fraction;

insert into public.families (source_code, name, icon_key, sort_order)
values
  ('TUBO', 'Tubo', 'cable', 10),
  ('FITTING', 'Fitting', 'git-branch', 20),
  ('VALVE', 'Valvole', 'wrench', 30),
  ('PRESSURE REGULATOR', 'Riduttori di pressione', 'gauge', 40),
  ('FLESSIBILI', 'Flessibili', 'cable', 50),
  ('INSTRUMENT', 'Instrument', 'circle-gauge', 60),
  ('RACCORDI', 'Raccordi', 'git-branch', 70),
  ('GUARNIZIONI', 'Guarnizioni', 'circle-dot', 80),
  ('ACCESSORI', 'Accessori', 'boxes', 90),
  ('ALTRO', 'Altro', 'boxes', 100)
on conflict (source_code) do update
set name = excluded.name,
    icon_key = excluded.icon_key,
    sort_order = excluded.sort_order;

insert into public.category_external_codes (category_id, source_system, external_code)
select category.id, 'caricamento_materiali_csv', mapping.external_code
from (
  values
    ('SW', 'SW'),
    ('PV', 'PV'),
    ('STANDARD_GAS', 'GAS NON UHP'),
    ('UHP_GASES', 'GAS UHP'),
    ('VDM', 'VDM'),
    ('PCW', 'PCW'),
    ('DRAIN', 'DRAIN'),
    ('EXHAUST', 'EXHAUST')
) as mapping(category_code, external_code)
join public.categories category on category.code = mapping.category_code
on conflict (source_system, external_code) do update
set category_id = excluded.category_id;

-- UPW is intentionally not mapped to DIW until the client confirms semantic equivalence.
