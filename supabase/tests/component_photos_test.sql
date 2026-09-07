begin;
select plan(10);

select is((select public from storage.buckets where id = 'uploads'), false, 'Uploads are private');
select is((select file_size_limit from storage.buckets where id = 'uploads'), 2097152::bigint, 'Storage enforces the 2 MB limit');
select is((select allowed_mime_types from storage.buckets where id = 'uploads'), array['image/jpeg', 'image/png'], 'Only JPG and PNG are allowed');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('59000000-0000-4000-8000-000000000001', 'photo-admin@example.test', '{"full_name":"Photo Admin"}'),
  ('59000000-0000-4000-8000-000000000002', 'photo-user@example.test', '{"full_name":"Photo User"}');
update public.profiles set role = 'admin' where id = '59000000-0000-4000-8000-000000000001';
insert into public.families (id, name) values ('69000000-0000-4000-8000-000000000001', 'Photo test');
insert into public.components (id, family_id, name, photo_path)
values ('79000000-0000-4000-8000-000000000001', '69000000-0000-4000-8000-000000000001', 'Photo component', 'components/89000000-0000-4000-8000-000000000001.png');

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', true);
select lives_ok($$
  insert into storage.objects (bucket_id, name) values
    ('uploads', 'components/89000000-0000-4000-8000-000000000001.png'),
    ('uploads', 'components/89000000-0000-4000-8000-000000000002.png')
$$, 'Admin can insert photos');

select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000002', true);
select is((select count(*) from storage.objects where bucket_id = 'uploads'), 1::bigint, 'User can read only the linked photo');
select throws_ok($$
  insert into storage.objects (bucket_id, name) values ('uploads', 'components/89000000-0000-4000-8000-000000000003.png')
$$, '42501', 'new row violates row-level security policy for table "objects"', 'User cannot upload');
select results_eq($$with removed as (delete from storage.objects where bucket_id = 'uploads' returning id) select count(*) from removed$$, $$select 0::bigint$$, 'User cannot delete uploads');

reset role;
update public.profiles set is_active = false where id = '59000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'uploads'), 0::bigint, 'Inactive user cannot read uploads');

select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', true);
select results_eq($$with removed as (delete from storage.objects where bucket_id = 'uploads' and name = 'components/89000000-0000-4000-8000-000000000001.png' returning id) select count(*) from removed$$, $$select 0::bigint$$, 'A referenced photo cannot be deleted');
update public.components set photo_path = null where id = '79000000-0000-4000-8000-000000000001';
select results_eq($$with removed as (delete from storage.objects where bucket_id = 'uploads' and name = 'components/89000000-0000-4000-8000-000000000001.png' returning id) select count(*) from removed$$, $$select 1::bigint$$, 'Admin can delete the detached photo');

select * from finish();
rollback;
