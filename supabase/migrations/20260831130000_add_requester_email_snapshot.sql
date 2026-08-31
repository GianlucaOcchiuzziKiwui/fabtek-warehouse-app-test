alter table public.material_requests
add column requester_email text;

update public.material_requests request
set requester_email = lower(btrim(auth_user.email))
from auth.users auth_user
where auth_user.id = request.requester_id
  and nullif(btrim(auth_user.email), '') is not null;

alter table public.material_requests
add constraint material_requests_requester_email_format check (
  requester_email is null
  or requester_email = lower(btrim(requester_email))
);

create or replace function public.set_material_request_requester_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select lower(btrim(auth_user.email))
  into new.requester_email
  from auth.users auth_user
  where auth_user.id = new.requester_id
    and nullif(btrim(auth_user.email), '') is not null;

  return new;
end;
$$;

revoke all on function public.set_material_request_requester_email() from public;

create trigger material_requests_set_requester_email
before insert on public.material_requests
for each row execute function public.set_material_request_requester_email();
