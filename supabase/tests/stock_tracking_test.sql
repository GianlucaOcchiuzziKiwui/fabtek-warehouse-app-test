begin;

select plan(33);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'stock-user@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Stock User"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'stock-admin@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Stock Admin"}'::jsonb,
    now(),
    now()
  );

update public.profiles
set role = 'admin'
where id = '50000000-0000-0000-0000-000000000002';

insert into public.categories (id, code, name)
values ('30000000-0000-0000-0000-000000000001', 'STOCK_TEST', 'Stock test category');

insert into public.families (id, source_code, name)
values ('60000000-0000-0000-0000-000000000001', 'STOCK_TEST', 'Stock test family');

select hasnt_table(
  'public',
  'category_families',
  'category-family compatibility is not persisted'
);

select hasnt_function(
  'public',
  'validate_item_variant_category',
  'item-category writes do not depend on a category-family table'
);

select hasnt_function(
  'public',
  'validate_component_family_change',
  'component family changes are independent from item categories'
);

select hasnt_function(
  'public',
  'validate_variant_component_change',
  'variant component changes preserve categories without compatibility lookup'
);

insert into public.components (id, family_id, name)
values ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Stock test component');

insert into public.units_of_measure (id, code, name)
values ('80000000-0000-0000-0000-000000000001', 'stk', 'Stock test unit');

insert into public.item_variants (
  id,
  component_id,
  fabtek_code,
  description,
  material,
  connection,
  unit_of_measure_id
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'UNTRACKED-1',
    'Untracked test variant',
    'Steel',
    'Threaded',
    '80000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    'TRACKED-1',
    'Tracked test variant',
    'Steel',
    'Threaded',
    '80000000-0000-0000-0000-000000000001'
  );

update public.item_variants
set track_inventory = true
where id = '20000000-0000-0000-0000-000000000002';

insert into public.item_variant_categories (item_variant_id, category_id)
values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001');

insert into public.inventory (item_variant_id, on_hand_quantity, reserved_quantity, low_stock_threshold)
values ('20000000-0000-0000-0000-000000000002', 5, 0, 2);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select is(
  (select track_inventory from public.item_variants where fabtek_code = 'UNTRACKED-1'),
  false,
  'new variants do not track inventory by default'
);

select lives_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000001',
    'P-1', 'T-1', 'Utility libera', null,
    jsonb_build_array(jsonb_build_object(
      'item_variant_id', '20000000-0000-0000-0000-000000000001',
      'category_id', '30000000-0000-0000-0000-000000000001',
      'quantity', 250
    ))
  ) $$,
  'untracked variant can be requested without inventory row'
);

select is(
  (select count(*) from public.inventory_movements where item_variant_id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'untracked request creates no reservation movement'
);

select throws_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000002',
    'P-1', 'T-1', 'Utility libera', null,
    jsonb_build_array(jsonb_build_object(
      'item_variant_id', '20000000-0000-0000-0000-000000000002',
      'category_id', '30000000-0000-0000-0000-000000000001',
      'quantity', 6
    ))
  ) $$,
  'P0001',
  'INSUFFICIENT_STOCK_OR_INVALID_VARIANT',
  'tracked variant cannot exceed availability'
);

select results_eq(
  $$ select track_inventory, available_quantity, stock_status
     from public.get_catalog_availability()
     where item_variant_id = '20000000-0000-0000-0000-000000000001' $$,
  $$ values (false, null::integer, 'unlimited'::text) $$,
  'untracked availability is unlimited and has no fake quantity'
);

update public.inventory
set on_hand_quantity = 10
where item_variant_id = '20000000-0000-0000-0000-000000000002';

select lives_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000003', 'P-2', 'T-2', 'Utility', null,
    jsonb_build_array(jsonb_build_object(
      'item_variant_id', '20000000-0000-0000-0000-000000000002',
      'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 4
    ))
  ) $$,
  'tracked variant can reserve available stock'
);

select is(
  (select reserved_quantity from public.inventory where item_variant_id = '20000000-0000-0000-0000-000000000002'),
  4,
  'tracked request reserves stock'
);

select is(
  (select count(*) from public.inventory_movements
   where item_variant_id = '20000000-0000-0000-0000-000000000002'
     and movement_type = 'reservation'),
  1::bigint,
  'tracked request records one reservation movement'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$ select * from public.fulfill_request_line(
    (select id from public.material_request_lines where item_variant_id = '20000000-0000-0000-0000-000000000001'),
    250, '40000000-0000-0000-0000-000000000001', null
  ) $$,
  'untracked fulfillment succeeds without inventory'
);

select is(
  (select count(*) from public.inventory_movements
   where item_variant_id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'untracked fulfillment creates no inventory movement'
);

select lives_ok(
  $$ do $block$
     declare v_line_id uuid := (
       select id from public.material_request_lines
       where item_variant_id = '20000000-0000-0000-0000-000000000002'
     );
     begin
       perform * from public.fulfill_request_line(v_line_id, 2, '40000000-0000-0000-0000-000000000002', null);
       perform * from public.fulfill_request_line(v_line_id, 2, '40000000-0000-0000-0000-000000000002', null);
     end $block$ $$,
  'tracked fulfillment retry is idempotent'
);

select results_eq(
  $$ select i.on_hand_quantity, i.reserved_quantity, line.fulfilled_quantity,
            (select count(*)::integer from public.fulfillment_events event where event.request_line_id = line.id)
     from public.inventory i
     join public.material_request_lines line on line.item_variant_id = i.item_variant_id
     where i.item_variant_id = '20000000-0000-0000-0000-000000000002' $$,
  $$ values (8, 2, 2, 1) $$,
  'tracked fulfillment mutates inventory and event history once'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000004', 'P-3', 'T-3', 'Utility', null,
    jsonb_build_array(jsonb_build_object(
      'item_variant_id', '20000000-0000-0000-0000-000000000002',
      'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 2
    ))
  ) $$,
  'tracked transition fixture reserves stock'
);

select is(
  (select snapshot_track_inventory from public.material_request_lines
   where request_id = (
     select id from public.material_requests
     where client_request_id = '10000000-0000-0000-0000-000000000004'
   )),
  true,
  'tracked stock semantics are snapshotted on submission'
);

select lives_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000005', 'P-4', 'T-4', 'Utility', null,
    jsonb_build_array(jsonb_build_object(
      'item_variant_id', '20000000-0000-0000-0000-000000000001',
      'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
    ))
  ) $$,
  'untracked transition fixture remains inventory-free'
);

select is(
  (select snapshot_track_inventory from public.material_request_lines
   where request_id = (
     select id from public.material_requests
     where client_request_id = '10000000-0000-0000-0000-000000000005'
   )),
  false,
  'untracked stock semantics are snapshotted on submission'
);

update public.item_variants
set track_inventory = not track_inventory
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$ select * from public.fulfill_request_line(
    (select line.id
     from public.material_request_lines line
     join public.material_requests request on request.id = line.request_id
     where request.client_request_id = '10000000-0000-0000-0000-000000000004'),
    2, '40000000-0000-0000-0000-000000000004', null
  ) $$,
  'tracked request releases its reservation after the variant becomes untracked'
);

select results_eq(
  $$ select on_hand_quantity, reserved_quantity
     from public.inventory
     where item_variant_id = '20000000-0000-0000-0000-000000000002' $$,
  $$ values (6, 2) $$,
  'tracked snapshot controls inventory after a true-to-false transition'
);

select lives_ok(
  $$ select * from public.fulfill_request_line(
    (select line.id
     from public.material_request_lines line
     join public.material_requests request on request.id = line.request_id
     where request.client_request_id = '10000000-0000-0000-0000-000000000005'),
    1, '40000000-0000-0000-0000-000000000005', null
  ) $$,
  'untracked request stays inventory-free after the variant becomes tracked'
);

select is(
  (select count(*) from public.inventory_movements
   where item_variant_id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'untracked snapshot creates no movement after a false-to-true transition'
);

update public.item_variants
set track_inventory = id = '20000000-0000-0000-0000-000000000002'
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000006', ' P-5 ', ' T-5 ', ' Utility ', '   ',
    jsonb_build_array(
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000001',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
      ),
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000002',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
      )
    )
  ) $$,
  'multi-line request fixture is accepted'
);

select lives_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000006', 'P-5', 'T-5', 'Utility', null,
    jsonb_build_array(
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000001',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
      ),
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000002',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
      )
    )
  ) $$,
  'same idempotency key and normalized payload returns the existing request'
);

select throws_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000006', 'P-CHANGED', 'T-5', 'Utility', null,
    jsonb_build_array(
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000001',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
      ),
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000002',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
      )
    )
  ) $$,
  'P0004',
  'IDEMPOTENCY_PAYLOAD_MISMATCH',
  'same idempotency key rejects a changed header'
);

select throws_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000006', 'P-5', 'T-5', 'Utility', null,
    jsonb_build_array(
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000001',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 2
      ),
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000002',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
      )
    )
  ) $$,
  'P0004',
  'IDEMPOTENCY_PAYLOAD_MISMATCH',
  'same idempotency key rejects a changed line'
);

select throws_ok(
  $$ select * from public.submit_material_request(
    '10000000-0000-0000-0000-000000000006', 'P-5', 'T-5', 'Utility', null,
    jsonb_build_array(
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000002',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
      ),
      jsonb_build_object(
        'item_variant_id', '20000000-0000-0000-0000-000000000001',
        'category_id', '30000000-0000-0000-0000-000000000001', 'quantity', 1
      )
    )
  ) $$,
  'P0004',
  'IDEMPOTENCY_PAYLOAD_MISMATCH',
  'same idempotency key rejects changed line order'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$ select * from public.fulfill_request_line(
    (select line.id from public.material_request_lines line
     join public.material_requests request on request.id = line.request_id
     where request.client_request_id = '10000000-0000-0000-0000-000000000006'
       and line.item_variant_id = '20000000-0000-0000-0000-000000000001'),
    1, '40000000-0000-0000-0000-000000000006', null
  ) $$,
  'first line completion succeeds'
);

select lives_ok(
  $$ select * from public.fulfill_request_line(
    (select line.id from public.material_request_lines line
     join public.material_requests request on request.id = line.request_id
     where request.client_request_id = '10000000-0000-0000-0000-000000000006'
       and line.item_variant_id = '20000000-0000-0000-0000-000000000002'),
    1, '40000000-0000-0000-0000-000000000007', null
  ) $$,
  'second line completion succeeds'
);

select is(
  (select status from public.material_requests
   where client_request_id = '10000000-0000-0000-0000-000000000006'),
  'evasa'::public.request_status,
  'the parent request becomes complete after every line is fulfilled'
);

select is(
  (select count(*) from public.generated_documents document
   join public.material_requests request on request.id = document.request_id
   where request.client_request_id = '10000000-0000-0000-0000-000000000006'
     and document.document_type = 'final_report'),
  1::bigint,
  'a completed multi-line request creates one final report job'
);

select * from finish();

rollback;
