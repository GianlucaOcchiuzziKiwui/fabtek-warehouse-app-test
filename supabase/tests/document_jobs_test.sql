begin;

select plan(68);

select has_function(
  'public',
  'claim_generated_document_jobs',
  array['integer', 'integer'],
  'document jobs expose an atomic claim function'
);
select has_function(
  'public',
  'complete_generated_document_job',
  array['uuid', 'integer', 'text', 'text', 'text', 'text[]', 'text'],
  'document jobs expose an atomic completion function'
);
select has_function(
  'public',
  'fail_generated_document_job',
  array['uuid', 'integer', 'text', 'timestamp with time zone', 'boolean'],
  'document jobs expose an atomic failure function'
);
select has_function(
  'public',
  'claim_notification_jobs',
  array['integer', 'integer'],
  'notification jobs expose an atomic claim function'
);
select has_function(
  'public',
  'complete_notification_job',
  array['uuid', 'integer', 'text'],
  'notification jobs expose an atomic completion function'
);
select has_function(
  'public',
  'fail_notification_job',
  array['uuid', 'integer', 'text', 'timestamp with time zone', 'boolean'],
  'notification jobs expose an atomic failure function'
);

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
values (
  '00000000-0000-0000-0000-000000000000',
  '51000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'document-worker@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Document Worker Test"}'::jsonb,
  now(),
  now()
);

insert into public.material_requests (
  id,
  client_request_id,
  requester_id,
  project,
  tool_line,
  utilities
)
values
  (
    '11000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    'Document job claim',
    'T-1',
    'Test'
  ),
  (
    '11000000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000001',
    'Document terminal failure',
    'T-2',
    'Test'
  ),
  (
    '11000000-0000-0000-0000-000000000003',
    '12000000-0000-0000-0000-000000000003',
    '51000000-0000-0000-0000-000000000001',
    'Document retryable failure',
    'T-3',
    'Test'
  ),
  (
    '11000000-0000-0000-0000-000000000004',
    '12000000-0000-0000-0000-000000000004',
    '51000000-0000-0000-0000-000000000001',
    'Notification terminal failure',
    'T-4',
    'Test'
  );

insert into public.generated_documents (
  id,
  request_id,
  document_type,
  next_attempt_at,
  created_at
)
values (
  'a1000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'initial_request',
  now() - interval '2 minutes',
  now() - interval '2 minutes'
);

create temporary table first_document_claim as
select * from public.claim_generated_document_jobs(1, 300);

select is(
  (select count(*) from first_document_claim),
  1::bigint,
  'a ready document job is claimed once'
);
select is(
  (select attempts from first_document_claim),
  1,
  'claim increments the document attempt count'
);
select ok(
  (
    select status = 'processing'
      and lease_expires_at > now()
    from public.generated_documents
    where id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'claim gives the document job an active processing lease'
);
select is(
  (select count(*) from public.claim_generated_document_jobs(1, 300)),
  0::bigint,
  'an active document lease prevents a second claim'
);

update public.generated_documents
set lease_expires_at = now() - interval '1 second'
where id = 'a1000000-0000-0000-0000-000000000001';

create temporary table reclaimed_document as
select * from public.claim_generated_document_jobs(1, 300);

select is(
  (select id from reclaimed_document),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'a document job with an expired lease is recovered'
);
select is(
  (select attempts from reclaimed_document),
  2,
  'recovering an expired document lease increments attempts'
);
select ok(
  (select lease_expires_at > now() from reclaimed_document),
  'recovered document jobs receive a fresh lease'
);
select is(
  public.complete_generated_document_job(
    'a1000000-0000-0000-0000-000000000001',
    1,
    'requests/1/stale.pdf',
    repeat('f', 64),
    '1',
    array['warehouse@example.test'],
    'Stale document worker'
  ),
  false,
  'the first document worker cannot complete a replacement lease'
);
select is(
  public.fail_generated_document_job(
    'a1000000-0000-0000-0000-000000000001',
    1,
    'STALE_WORKER',
    now() + interval '5 minutes',
    false
  ),
  false,
  'the first document worker cannot fail a replacement lease'
);
select ok(
  (
    select status = 'processing'
      and attempts = 2
      and lease_expires_at > now()
    from public.generated_documents
    where id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'stale document updates leave the replacement lease unchanged'
);

update public.generated_documents
set lease_expires_at = now() - interval '1 second'
where id = 'a1000000-0000-0000-0000-000000000001';

select is(
  public.complete_generated_document_job(
    'a1000000-0000-0000-0000-000000000001',
    2,
    'requests/1/initial-request-v1.pdf',
    repeat('a', 64),
    '1',
    array['warehouse@example.test'],
    'Richiesta Fabtek'
  ),
  false,
  'a document cannot complete after its lease expires'
);
select is(
  (
    select status::text
    from public.generated_documents
    where id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'processing',
  'rejected completion leaves the document processing'
);
select is(
  (
    select count(*)
    from public.notification_jobs
    where request_id = '11000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'rejected completion does not enqueue a notification'
);

update public.generated_documents
set lease_expires_at = now() + interval '5 minutes'
where id = 'a1000000-0000-0000-0000-000000000001';

select is(
  public.complete_generated_document_job(
    'a1000000-0000-0000-0000-000000000001',
    2,
    'requests/1/initial-request-v1.pdf',
    repeat('a', 64),
    '1',
    array['warehouse@example.test'],
    'Richiesta Fabtek'
  ),
  true,
  'a document completes while its lease is active'
);
select ok(
  (
    select status = 'completed'
      and storage_path = 'requests/1/initial-request-v1.pdf'
      and content_sha256 = repeat('a', 64)
      and completed_at is not null
      and lease_expires_at is null
    from public.generated_documents
    where id = 'a1000000-0000-0000-0000-000000000001'
  ),
  'completion persists document metadata and releases the lease'
);
select is(
  (
    select count(*)
    from public.notification_jobs
    where request_id = '11000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'document completion enqueues one notification'
);

update public.generated_documents
set status = 'processing',
    lease_expires_at = now() + interval '5 minutes'
where id = 'a1000000-0000-0000-0000-000000000001';

select is(
  public.complete_generated_document_job(
    'a1000000-0000-0000-0000-000000000001',
    2,
    'requests/1/initial-request-v1.pdf',
    repeat('a', 64),
    '1',
    array['warehouse@example.test'],
    'Richiesta Fabtek'
  ),
  true,
  'replaying an otherwise valid completion succeeds'
);
select is(
  (
    select count(*)
    from public.notification_jobs
    where request_id = '11000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'a completion replay does not duplicate the notification job'
);

create temporary table first_notification_claim as
select * from public.claim_notification_jobs(1, 300);

select is(
  (select count(*) from first_notification_claim),
  1::bigint,
  'a ready notification job is claimed once'
);
select is(
  (select attempts from first_notification_claim),
  1,
  'claim increments the notification attempt count'
);
select is(
  (select count(*) from public.claim_notification_jobs(1, 300)),
  0::bigint,
  'an active notification lease prevents a second claim'
);

update public.notification_jobs
set lease_expires_at = now() - interval '1 second'
where id = (select id from first_notification_claim);

create temporary table reclaimed_notification as
select * from public.claim_notification_jobs(1, 300);

select is(
  (select count(*) from reclaimed_notification),
  1::bigint,
  'a notification job with an expired lease is recovered'
);
select is(
  (select attempts from reclaimed_notification),
  2,
  'recovering an expired notification lease increments attempts'
);
select is(
  public.complete_notification_job(
    (select id from reclaimed_notification),
    1,
    'stale-provider-message'
  ),
  false,
  'the first notification worker cannot complete a replacement lease'
);
select is(
  public.fail_notification_job(
    (select id from reclaimed_notification),
    1,
    'STALE_WORKER',
    now() + interval '5 minutes',
    false
  ),
  false,
  'the first notification worker cannot fail a replacement lease'
);
select ok(
  (
    select status = 'processing'
      and attempts = 2
      and lease_expires_at > now()
    from public.notification_jobs
    where id = (select id from reclaimed_notification)
  ),
  'stale notification updates leave the replacement lease unchanged'
);
select is(
  public.fail_notification_job(
    (select id from reclaimed_notification),
    2,
    'PROVIDER_UNAVAILABLE',
    now() + interval '5 minutes',
    false
  ),
  true,
  'a retryable notification failure is accepted with an active lease'
);
select is(
  (
    select status::text
    from public.notification_jobs
    where id = (select id from reclaimed_notification)
  ),
  'pending',
  'a retryable notification failure returns to pending'
);
select ok(
  (
    select next_attempt_at > now()
    from public.notification_jobs
    where id = (select id from reclaimed_notification)
  ),
  'a retryable notification failure schedules a future attempt'
);

update public.notification_jobs
set next_attempt_at = now() - interval '1 second'
where id = (select id from reclaimed_notification);

create temporary table third_notification_claim as
select * from public.claim_notification_jobs(1, 300);

select is(
  (select attempts from third_notification_claim),
  3,
  'a retryable notification can be claimed again when ready'
);
select is(
  public.complete_notification_job(
    (select id from third_notification_claim),
    3,
    'provider-message-1'
  ),
  true,
  'a notification completes while its lease is active'
);
select ok(
  (
    select status = 'completed'
      and provider_message_id = 'provider-message-1'
      and sent_at is not null
      and lease_expires_at is null
    from public.notification_jobs
    where id = (select id from third_notification_claim)
  ),
  'notification completion persists delivery metadata and releases the lease'
);

insert into public.generated_documents (
  id,
  request_id,
  document_type,
  next_attempt_at,
  created_at
)
values
  (
    'a1000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000002',
    'initial_request',
    now() - interval '2 minutes',
    now() - interval '2 minutes'
  ),
  (
    'a1000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000003',
    'initial_request',
    now() - interval '1 minute',
    now() - interval '1 minute'
  );

create temporary table failed_document_claims as
select * from public.claim_generated_document_jobs(2, 300);

select is(
  (select count(*) from failed_document_claims),
  2::bigint,
  'document failure scenarios claim both ready jobs'
);
select is(
  public.fail_generated_document_job(
    'a1000000-0000-0000-0000-000000000002',
    1,
    'RENDER_FAILED',
    now(),
    true
  ),
  true,
  'a terminal document failure is accepted with an active lease'
);
select is(
  (
    select status::text
    from public.generated_documents
    where id = 'a1000000-0000-0000-0000-000000000002'
  ),
  'failed',
  'a terminal document error produces failed status'
);
select is(
  public.fail_generated_document_job(
    'a1000000-0000-0000-0000-000000000003',
    1,
    'UPLOAD_FAILED',
    now() + interval '5 minutes',
    false
  ),
  true,
  'a retryable document failure is accepted with an active lease'
);
select is(
  (
    select status::text
    from public.generated_documents
    where id = 'a1000000-0000-0000-0000-000000000003'
  ),
  'pending',
  'a retryable document error produces pending status'
);
select ok(
  (
    select next_attempt_at > now()
    from public.generated_documents
    where id = 'a1000000-0000-0000-0000-000000000003'
  ),
  'a retryable document error schedules a future attempt'
);

insert into public.generated_documents (
  id,
  request_id,
  document_type,
  storage_path,
  content_sha256,
  status,
  completed_at
)
values (
  'a1000000-0000-0000-0000-000000000004',
  '11000000-0000-0000-0000-000000000004',
  'initial_request',
  'requests/4/initial-request-v1.pdf',
  repeat('b', 64),
  'completed',
  now()
);

insert into public.notification_jobs (
  id,
  request_id,
  document_id,
  document_type,
  recipients,
  subject,
  next_attempt_at
)
values (
  'b1000000-0000-0000-0000-000000000004',
  '11000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000004',
  'initial_request',
  array['warehouse@example.test'],
  'Richiesta Fabtek',
  now() - interval '1 minute'
);

create temporary table terminal_notification_claim as
select * from public.claim_notification_jobs(1, 300);

select is(
  (select id from terminal_notification_claim),
  'b1000000-0000-0000-0000-000000000004'::uuid,
  'the terminal notification scenario claims its ready job'
);
select is(
  public.fail_notification_job(
    'b1000000-0000-0000-0000-000000000004',
    1,
    'INVALID_RECIPIENTS',
    now(),
    true
  ),
  true,
  'a terminal notification failure is accepted with an active lease'
);
select is(
  (
    select status::text
    from public.notification_jobs
    where id = 'b1000000-0000-0000-0000-000000000004'
  ),
  'failed',
  'a terminal notification error produces failed status'
);

insert into public.material_requests (
  id,
  client_request_id,
  requester_id,
  project,
  tool_line,
  utilities
)
values
  (
    '11000000-0000-0000-0000-000000000005',
    '12000000-0000-0000-0000-000000000005',
    '51000000-0000-0000-0000-000000000001',
    'Expired fifth document attempt',
    'T-5',
    'Test'
  ),
  (
    '11000000-0000-0000-0000-000000000006',
    '12000000-0000-0000-0000-000000000006',
    '51000000-0000-0000-0000-000000000001',
    'Fifth document failure',
    'T-6',
    'Test'
  ),
  (
    '11000000-0000-0000-0000-000000000007',
    '12000000-0000-0000-0000-000000000007',
    '51000000-0000-0000-0000-000000000001',
    'Expired fifth notification attempt',
    'T-7',
    'Test'
  ),
  (
    '11000000-0000-0000-0000-000000000008',
    '12000000-0000-0000-0000-000000000008',
    '51000000-0000-0000-0000-000000000001',
    'Fifth notification failure',
    'T-8',
    'Test'
  );

insert into public.generated_documents (
  id,
  request_id,
  document_type,
  status,
  attempts,
  lease_expires_at
)
values
  (
    'a1000000-0000-0000-0000-000000000005',
    '11000000-0000-0000-0000-000000000005',
    'initial_request',
    'processing',
    5,
    now() - interval '1 second'
  ),
  (
    'a1000000-0000-0000-0000-000000000006',
    '11000000-0000-0000-0000-000000000006',
    'initial_request',
    'processing',
    5,
    now() + interval '5 minutes'
  ),
  (
    'a1000000-0000-0000-0000-000000000007',
    '11000000-0000-0000-0000-000000000007',
    'initial_request',
    'completed',
    1,
    null
  ),
  (
    'a1000000-0000-0000-0000-000000000008',
    '11000000-0000-0000-0000-000000000008',
    'initial_request',
    'completed',
    1,
    null
  );

select is(
  (select count(*) from public.claim_generated_document_jobs(1, 300)),
  0::bigint,
  'an expired fifth document attempt is not claimed again'
);
select ok(
  (
    select status = 'failed'
      and lease_expires_at is null
      and last_error = 'MAX_ATTEMPTS_EXHAUSTED'
    from public.generated_documents
    where id = 'a1000000-0000-0000-0000-000000000005'
  ),
  'claim atomically terminalizes an expired fifth document attempt'
);
select is(
  public.fail_generated_document_job(
    'a1000000-0000-0000-0000-000000000006',
    5,
    'RETRY_REQUESTED_AFTER_LIMIT',
    now() + interval '5 minutes',
    false
  ),
  true,
  'a fifth document failure is handled even when marked retryable'
);
select is(
  (
    select status::text
    from public.generated_documents
    where id = 'a1000000-0000-0000-0000-000000000006'
  ),
  'failed',
  'a fifth document failure cannot return to pending'
);

insert into public.notification_jobs (
  id,
  request_id,
  document_id,
  document_type,
  recipients,
  subject,
  status,
  attempts,
  lease_expires_at
)
values
  (
    'b1000000-0000-0000-0000-000000000007',
    '11000000-0000-0000-0000-000000000007',
    'a1000000-0000-0000-0000-000000000007',
    'initial_request',
    array['warehouse@example.test'],
    'Expired fifth notification attempt',
    'processing',
    5,
    now() - interval '1 second'
  ),
  (
    'b1000000-0000-0000-0000-000000000008',
    '11000000-0000-0000-0000-000000000008',
    'a1000000-0000-0000-0000-000000000008',
    'initial_request',
    array['warehouse@example.test'],
    'Fifth notification failure',
    'processing',
    5,
    now() + interval '5 minutes'
  );

select is(
  (select count(*) from public.claim_notification_jobs(1, 300)),
  0::bigint,
  'an expired fifth notification attempt is not claimed again'
);
select ok(
  (
    select status = 'failed'
      and lease_expires_at is null
      and last_error = 'MAX_ATTEMPTS_EXHAUSTED'
    from public.notification_jobs
    where id = 'b1000000-0000-0000-0000-000000000007'
  ),
  'claim atomically terminalizes an expired fifth notification attempt'
);
select is(
  public.fail_notification_job(
    'b1000000-0000-0000-0000-000000000008',
    5,
    'RETRY_REQUESTED_AFTER_LIMIT',
    now() + interval '5 minutes',
    false
  ),
  true,
  'a fifth notification failure is handled even when marked retryable'
);
select is(
  (
    select status::text
    from public.notification_jobs
    where id = 'b1000000-0000-0000-0000-000000000008'
  ),
  'failed',
  'a fifth notification failure cannot return to pending'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.claim_generated_document_jobs(integer,integer)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot claim document jobs'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.complete_generated_document_job(uuid,integer,text,text,text,text[],text)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot complete document jobs'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.fail_generated_document_job(uuid,integer,text,timestamp with time zone,boolean)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot fail document jobs'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.claim_notification_jobs(integer,integer)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot claim notification jobs'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.complete_notification_job(uuid,integer,text)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot complete notification jobs'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.fail_notification_job(uuid,integer,text,timestamp with time zone,boolean)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot fail notification jobs'
);

select is(
  has_function_privilege(
    'service_role',
    'public.claim_generated_document_jobs(integer,integer)',
    'EXECUTE'
  ),
  true,
  'service_role can claim document jobs'
);
select is(
  has_function_privilege(
    'service_role',
    'public.complete_generated_document_job(uuid,integer,text,text,text,text[],text)',
    'EXECUTE'
  ),
  true,
  'service_role can complete document jobs'
);
select is(
  has_function_privilege(
    'service_role',
    'public.fail_generated_document_job(uuid,integer,text,timestamp with time zone,boolean)',
    'EXECUTE'
  ),
  true,
  'service_role can fail document jobs'
);
select is(
  has_function_privilege(
    'service_role',
    'public.claim_notification_jobs(integer,integer)',
    'EXECUTE'
  ),
  true,
  'service_role can claim notification jobs'
);
select is(
  has_function_privilege(
    'service_role',
    'public.complete_notification_job(uuid,integer,text)',
    'EXECUTE'
  ),
  true,
  'service_role can complete notification jobs'
);
select is(
  has_function_privilege(
    'service_role',
    'public.fail_notification_job(uuid,integer,text,timestamp with time zone,boolean)',
    'EXECUTE'
  ),
  true,
  'service_role can fail notification jobs'
);

set local role authenticated;

select throws_ok(
  $$ select * from public.claim_generated_document_jobs(1, 300) $$,
  '42501',
  null,
  'authenticated receives a permission error when invoking a worker RPC'
);

reset role;

select * from finish();
rollback;
