begin;

select plan(17);

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
    '51000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'catalog-admin@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Catalog Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '51000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'catalog-user@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Catalog User"}'::jsonb,
    now(),
    now()
  );

update public.profiles
set role = 'admin'
where id = '51000000-0000-0000-0000-000000000001';

insert into public.categories (id, code, name)
values
  ('31000000-0000-0000-0000-000000000001', 'CATALOG_RPC_1', 'Catalog RPC category 1'),
  ('31000000-0000-0000-0000-000000000002', 'CATALOG_RPC_2', 'Catalog RPC category 2'),
  ('31000000-0000-0000-0000-000000000003', 'CATALOG_RPC_3', 'Catalog RPC category 3');

insert into public.families (id, source_code, name)
values (
  '61000000-0000-0000-0000-000000000001',
  'CATALOG_RPC',
  'Catalog RPC family'
);

insert into public.components (id, family_id, name)
values (
  '71000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  'Catalog RPC component'
);

insert into public.units_of_measure (id, code, name)
values (
  '81000000-0000-0000-0000-000000000001',
  'rpc',
  'Catalog RPC unit'
);

select has_column(
  'public',
  'item_variants',
  'sort_order',
  'item variants expose deterministic ordering'
);

select col_not_null(
  'public',
  'item_variants',
  'sort_order',
  'variant ordering is required'
);

select col_default_is(
  'public',
  'item_variants',
  'sort_order',
  '0',
  'variant ordering defaults to zero'
);

select has_function(
  'public',
  'save_catalog_variant',
  array[
    'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text',
    'text', 'uuid', 'uuid[]', 'boolean', 'integer', 'boolean'
  ],
  'the atomic variant save RPC exists'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);

create temporary table catalog_rpc_state (
  variant_id uuid primary key
) on commit drop;

insert into catalog_rpc_state (variant_id)
select public.save_catalog_variant(
  null,
  '71000000-0000-0000-0000-000000000001',
  'CAT-RPC-1',
  '  ORACLE-RPC-1  ',
  '  Initial description  ',
  '  12 mm  ',
  '  Steel  ',
  '  Threaded  ',
  '81000000-0000-0000-0000-000000000001',
  array[
    '31000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000002'
  ]::uuid[],
  true,
  20,
  true
);

select isnt(
  (select variant_id from catalog_rpc_state),
  null::uuid,
  'an Admin can create a variant'
);

select results_eq(
  $$
    select category_id
    from public.item_variant_categories
    where item_variant_id = (select variant_id from catalog_rpc_state)
    order by category_id
  $$,
  $$
    values
      ('31000000-0000-0000-0000-000000000001'::uuid),
      ('31000000-0000-0000-0000-000000000002'::uuid)
  $$,
  'Admin create stores exactly the selected categories'
);

update public.item_variants
set technical_attributes = '{"pressure":"high"}'::jsonb
where id = (select variant_id from catalog_rpc_state);

select is(
  public.save_catalog_variant(
    (select variant_id from catalog_rpc_state),
    '71000000-0000-0000-0000-000000000001',
    'CAT-RPC-1',
    '   ',
    'Updated description',
    null,
    'Inox',
    'Flanged',
    '81000000-0000-0000-0000-000000000001',
    array['31000000-0000-0000-0000-000000000003']::uuid[],
    false,
    5,
    false
  ),
  (select variant_id from catalog_rpc_state),
  'Admin update returns the edited variant ID'
);

select results_eq(
  $$
    select category_id
    from public.item_variant_categories
    where item_variant_id = (select variant_id from catalog_rpc_state)
  $$,
  $$ values ('31000000-0000-0000-0000-000000000003'::uuid) $$,
  'Admin update replaces the prior categories'
);

select results_eq(
  $$
    select technical_attributes, oracle_sapio_code::text, diameter, sort_order, track_inventory, is_active
    from public.item_variants
    where id = (select variant_id from catalog_rpc_state)
  $$,
  $$ values ('{"pressure":"high"}'::jsonb, null::text, null::text, 5, false, false) $$,
  'Admin update preserves technical attributes and applies normalized values'
);

select throws_ok(
  $$
    select public.save_catalog_variant(
      null,
      '71000000-0000-0000-0000-000000000001',
      'CAT-RPC-DUPLICATE',
      null,
      'Duplicate categories',
      null,
      'Steel',
      'Threaded',
      '81000000-0000-0000-0000-000000000001',
      array[
        '31000000-0000-0000-0000-000000000001',
        '31000000-0000-0000-0000-000000000001'
      ]::uuid[],
      false,
      0,
      true
    )
  $$,
  '22023',
  'DUPLICATE_CATEGORIES',
  'duplicate categories are rejected'
);

select throws_ok(
  $$
    select public.save_catalog_variant(
      null,
      '71000000-0000-0000-0000-000000000001',
      'CAT-RPC-EMPTY',
      null,
      'Empty categories',
      null,
      'Steel',
      'Threaded',
      '81000000-0000-0000-0000-000000000001',
      '{}'::uuid[],
      false,
      0,
      true
    )
  $$,
  '22023',
  'EMPTY_CATEGORIES',
  'empty categories are rejected'
);

select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$
    select public.save_catalog_variant(
      null,
      '71000000-0000-0000-0000-000000000001',
      'CAT-RPC-FORBIDDEN',
      null,
      'Forbidden variant',
      null,
      'Steel',
      'Threaded',
      '81000000-0000-0000-0000-000000000001',
      array['31000000-0000-0000-0000-000000000001']::uuid[],
      false,
      0,
      true
    )
  $$,
  '42501',
  'FORBIDDEN',
  'a normal User cannot save a variant'
);

select is(
  (select count(*) from public.item_variants where fabtek_code = 'CAT-RPC-FORBIDDEN'),
  0::bigint,
  'a denied User leaves no partial variant'
);

select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$
    select public.save_catalog_variant(
      null,
      '71000000-0000-0000-0000-000000000099',
      'CAT-RPC-INVALID-COMPONENT',
      null,
      'Invalid component',
      null,
      'Steel',
      'Threaded',
      '81000000-0000-0000-0000-000000000001',
      array['31000000-0000-0000-0000-000000000001']::uuid[],
      false,
      0,
      true
    )
  $$,
  '23503',
  null,
  'an invalid component aborts variant creation'
);

select throws_ok(
  $$
    select public.save_catalog_variant(
      null,
      '71000000-0000-0000-0000-000000000001',
      'CAT-RPC-INVALID-UNIT',
      null,
      'Invalid unit',
      null,
      'Steel',
      'Threaded',
      '81000000-0000-0000-0000-000000000099',
      array['31000000-0000-0000-0000-000000000001']::uuid[],
      false,
      0,
      true
    )
  $$,
  '23503',
  null,
  'an invalid unit aborts variant creation'
);

select throws_ok(
  $$
    select public.save_catalog_variant(
      null,
      '71000000-0000-0000-0000-000000000001',
      'CAT-RPC-INVALID-CATEGORY',
      null,
      'Invalid category',
      null,
      'Steel',
      'Threaded',
      '81000000-0000-0000-0000-000000000001',
      array['31000000-0000-0000-0000-000000000099']::uuid[],
      false,
      0,
      true
    )
  $$,
  '23503',
  null,
  'an invalid category aborts the whole variant save'
);

select is(
  (
    select count(*)
    from public.item_variants
    where fabtek_code::text like 'CAT-RPC-INVALID-%'
  ),
  0::bigint,
  'invalid relations leave no partial variants'
);

select * from finish();

rollback;
