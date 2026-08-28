create or replace function public.claim_generated_document_jobs(
  p_limit integer,
  p_lease_seconds integer
)
returns table (
  id uuid,
  request_id uuid,
  document_type public.document_type,
  template_version text,
  attempts integer,
  lease_expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with terminalized as (
    update public.generated_documents job
    set status = 'failed',
        lease_expires_at = null,
        last_error = 'MAX_ATTEMPTS_EXHAUSTED',
        updated_at = now()
    where job.attempts >= 5
      and (
        (job.status = 'pending' and job.next_attempt_at <= now())
        or (job.status = 'processing' and job.lease_expires_at < now())
      )
    returning job.id
  ), candidates as (
    select job.id
    from public.generated_documents job
    where job.attempts < 5
      and (
        (job.status = 'pending' and job.next_attempt_at <= now())
        or (job.status = 'processing' and job.lease_expires_at < now())
      )
    order by job.next_attempt_at, job.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 20))
  ), claimed as (
    update public.generated_documents job
    set status = 'processing',
        attempts = job.attempts + 1,
        lease_expires_at = now() + make_interval(
          secs => greatest(30, least(p_lease_seconds, 900))
        ),
        last_error = null,
        updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select
    claimed.id,
    claimed.request_id,
    claimed.document_type,
    claimed.template_version,
    claimed.attempts,
    claimed.lease_expires_at
  from claimed
  order by claimed.next_attempt_at, claimed.created_at;
$$;

create or replace function public.complete_generated_document_job(
  p_job_id uuid,
  p_attempts integer,
  p_storage_path text,
  p_content_sha256 text,
  p_template_version text,
  p_recipients text[],
  p_subject text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.generated_documents%rowtype;
begin
  update public.generated_documents job
  set storage_path = p_storage_path,
      content_sha256 = p_content_sha256,
      template_version = p_template_version,
      status = 'completed',
      lease_expires_at = null,
      last_error = null,
      completed_at = now(),
      updated_at = now()
  where job.id = p_job_id
    and job.status = 'processing'
    and job.attempts = p_attempts
    and job.lease_expires_at > now()
  returning job.* into v_document;

  if not found then
    return false;
  end if;

  insert into public.notification_jobs (
    request_id,
    document_id,
    document_type,
    recipients,
    subject
  )
  values (
    v_document.request_id,
    v_document.id,
    v_document.document_type,
    p_recipients,
    p_subject
  )
  on conflict (request_id, document_type) do nothing;

  return true;
end;
$$;

create or replace function public.fail_generated_document_job(
  p_job_id uuid,
  p_attempts integer,
  p_error text,
  p_retry_at timestamptz,
  p_terminal boolean
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with failed as (
    update public.generated_documents job
    set status = case
          when p_terminal or job.attempts >= 5 then 'failed'::public.job_status
          else 'pending'::public.job_status
        end,
        next_attempt_at = case
          when p_terminal or job.attempts >= 5 then job.next_attempt_at
          else p_retry_at
        end,
        lease_expires_at = null,
        last_error = p_error,
        updated_at = now()
    where job.id = p_job_id
      and job.status = 'processing'
      and job.attempts = p_attempts
      and job.lease_expires_at > now()
      and (p_terminal or job.attempts >= 5 or p_retry_at > now())
    returning 1
  )
  select exists (select 1 from failed);
$$;

create or replace function public.claim_notification_jobs(
  p_limit integer,
  p_lease_seconds integer
)
returns table (
  id uuid,
  request_id uuid,
  document_id uuid,
  document_type public.document_type,
  recipients text[],
  subject text,
  attempts integer,
  lease_expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with terminalized as (
    update public.notification_jobs job
    set status = 'failed',
        lease_expires_at = null,
        last_error = 'MAX_ATTEMPTS_EXHAUSTED',
        updated_at = now()
    where job.attempts >= 5
      and (
        (job.status = 'pending' and job.next_attempt_at <= now())
        or (job.status = 'processing' and job.lease_expires_at < now())
      )
    returning job.id
  ), candidates as (
    select job.id
    from public.notification_jobs job
    where job.attempts < 5
      and (
        (job.status = 'pending' and job.next_attempt_at <= now())
        or (job.status = 'processing' and job.lease_expires_at < now())
      )
    order by job.next_attempt_at, job.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 20))
  ), claimed as (
    update public.notification_jobs job
    set status = 'processing',
        attempts = job.attempts + 1,
        lease_expires_at = now() + make_interval(
          secs => greatest(30, least(p_lease_seconds, 900))
        ),
        last_error = null,
        updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select
    claimed.id,
    claimed.request_id,
    claimed.document_id,
    claimed.document_type,
    claimed.recipients,
    claimed.subject,
    claimed.attempts,
    claimed.lease_expires_at
  from claimed
  order by claimed.next_attempt_at, claimed.created_at;
$$;

create or replace function public.complete_notification_job(
  p_job_id uuid,
  p_attempts integer,
  p_provider_message_id text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with completed as (
    update public.notification_jobs job
    set status = 'completed',
        lease_expires_at = null,
        last_error = null,
        provider_message_id = p_provider_message_id,
        sent_at = now(),
        updated_at = now()
    where job.id = p_job_id
      and job.status = 'processing'
      and job.attempts = p_attempts
      and job.lease_expires_at > now()
    returning 1
  )
  select exists (select 1 from completed);
$$;

create or replace function public.fail_notification_job(
  p_job_id uuid,
  p_attempts integer,
  p_error text,
  p_retry_at timestamptz,
  p_terminal boolean
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with failed as (
    update public.notification_jobs job
    set status = case
          when p_terminal or job.attempts >= 5 then 'failed'::public.job_status
          else 'pending'::public.job_status
        end,
        next_attempt_at = case
          when p_terminal or job.attempts >= 5 then job.next_attempt_at
          else p_retry_at
        end,
        lease_expires_at = null,
        last_error = p_error,
        updated_at = now()
    where job.id = p_job_id
      and job.status = 'processing'
      and job.attempts = p_attempts
      and job.lease_expires_at > now()
      and (p_terminal or job.attempts >= 5 or p_retry_at > now())
    returning 1
  )
  select exists (select 1 from failed);
$$;

revoke execute on function public.claim_generated_document_jobs(integer, integer)
from public, anon, authenticated;
revoke execute on function public.complete_generated_document_job(uuid, integer, text, text, text, text[], text)
from public, anon, authenticated;
revoke execute on function public.fail_generated_document_job(uuid, integer, text, timestamptz, boolean)
from public, anon, authenticated;
revoke execute on function public.claim_notification_jobs(integer, integer)
from public, anon, authenticated;
revoke execute on function public.complete_notification_job(uuid, integer, text)
from public, anon, authenticated;
revoke execute on function public.fail_notification_job(uuid, integer, text, timestamptz, boolean)
from public, anon, authenticated;

grant execute on function public.claim_generated_document_jobs(integer, integer)
to service_role;
grant execute on function public.complete_generated_document_job(uuid, integer, text, text, text, text[], text)
to service_role;
grant execute on function public.fail_generated_document_job(uuid, integer, text, timestamptz, boolean)
to service_role;
grant execute on function public.claim_notification_jobs(integer, integer)
to service_role;
grant execute on function public.complete_notification_job(uuid, integer, text)
to service_role;
grant execute on function public.fail_notification_job(uuid, integer, text, timestamptz, boolean)
to service_role;
