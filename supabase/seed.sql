-- Stable baseline data only. Product variants and inventory are imported separately.

insert into public.categories (code, name, sort_order)
values
  ('PV', 'Process Vacuum', 10),
  ('STANDARD_GAS', 'Standard Gas (<25ra)', 20),
  ('UHP_GASES', 'UHP Gases (<10ra)', 30),
  ('SPECIAL_COAX_GASES', 'Special Coax Gases (Coaxial)', 40),
  ('PCW', 'Process Cooling Water', 50),
  ('SW', 'Soft Water', 60),
  ('EXHAUST', 'Exhaust', 70),
  ('DIW', 'UHP Water', 80),
  ('DRAIN', 'Waste', 90),
  ('CHEMICALS', 'Chemicals', 100),
  ('VDM', 'Vuoto di Macchina', 110),
  ('LIM', 'LIM', 120),
  ('CLEAN_ROOM', 'Clean Room', 130),
  ('OTHER_GENERALS', 'Other Generals', 140)
on conflict (code) do update
set name = excluded.name,
    sort_order = excluded.sort_order;

insert into public.units_of_measure (code, name, allows_fraction)
values
  ('pcs', 'Pezzi', false),
  ('m', 'Metri', false)
on conflict (code) do update
set name = excluded.name,
    allows_fraction = excluded.allows_fraction;

insert into public.families (source_code, name, sort_order)
values
  ('TUBO', 'Tubo', 10),
  ('FITTING', 'Fitting', 20),
  ('VALVE', 'Valvole', 30),
  ('PRESSURE REGULATOR', 'Riduttori di pressione', 40),
  ('FLESSIBILI', 'Flessibili', 50),
  ('INSTRUMENT', 'Instrument', 60),
  ('RACCORDI', 'Raccordi', 70),
  ('GUARNIZIONI', 'Guarnizioni', 80),
  ('ACCESSORI', 'Accessori', 90),
  ('ALTRO', 'Altro', 100)
on conflict (source_code) do update
set name = excluded.name,
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
