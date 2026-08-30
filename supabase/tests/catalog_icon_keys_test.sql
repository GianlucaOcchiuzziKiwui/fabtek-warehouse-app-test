begin;

select plan(16);

select has_column('public', 'categories', 'icon_key', 'categories expose an icon key');
select has_column('public', 'families', 'icon_key', 'families expose an icon key');
select has_column('public', 'components', 'icon_key', 'components expose an icon key');

select is(
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'categories' and column_name = 'icon_key'),
  'NO',
  'category icon keys are required'
);
select is(
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'families' and column_name = 'icon_key'),
  'NO',
  'family icon keys are required'
);
select is(
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'components' and column_name = 'icon_key'),
  'NO',
  'component icon keys are required'
);

select is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'categories' and column_name = 'icon_key'),
  '''factory''::text',
  'categories have a safe default icon'
);
select is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'families' and column_name = 'icon_key'),
  '''boxes''::text',
  'families have a safe default icon'
);
select is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'components' and column_name = 'icon_key'),
  '''component''::text',
  'components have a safe default icon'
);

select is(
  (
    select count(*)
    from pg_constraint
    where conname in (
      'categories_icon_key_check',
      'families_icon_key_check',
      'components_icon_key_check'
    )
  ),
  3::bigint,
  'all catalog levels reject unsupported icon keys'
);

select throws_ok(
  $$ update public.categories set icon_key = 'not-supported' where id = (select id from public.categories limit 1) $$,
  '23514',
  null,
  'categories reject an unsupported icon key'
);
select throws_ok(
  $$ update public.families set icon_key = 'not-supported' where id = (select id from public.families limit 1) $$,
  '23514',
  null,
  'families reject an unsupported icon key'
);
select throws_ok(
  $$ insert into public.components (family_id, name, icon_key) values ((select id from public.families limit 1), 'Invalid icon component', 'not-supported') $$,
  '23514',
  null,
  'components reject an unsupported icon key'
);

select lives_ok(
  $$ update public.categories set icon_key = 'filter' where id = (select id from public.categories limit 1) $$,
  'categories accept expanded technical icon keys'
);
select lives_ok(
  $$ update public.families set icon_key = 'cog' where id = (select id from public.families limit 1) $$,
  'families accept expanded technical icon keys'
);
select lives_ok(
  $$ update public.components set icon_key = 'circuit-board' where id = (select id from public.components limit 1) $$,
  'components accept expanded technical icon keys'
);

select * from finish();
rollback;
