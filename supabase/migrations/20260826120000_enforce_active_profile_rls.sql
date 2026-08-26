begin;

alter policy material_requests_select_own_or_admin
on public.material_requests
using (
  public.is_active_user()
  and (requester_id = (select auth.uid()) or public.has_role('admin'))
);

alter policy material_request_lines_select_own_or_admin
on public.material_request_lines
using (
  public.is_active_user()
  and exists (
    select 1
    from public.material_requests mr
    where mr.id = request_id
      and (mr.requester_id = (select auth.uid()) or public.has_role('admin'))
  )
);

alter policy fulfillment_events_select_own_or_admin
on public.fulfillment_events
using (
  public.is_active_user()
  and exists (
    select 1
    from public.material_request_lines line
    join public.material_requests mr on mr.id = line.request_id
    where line.id = request_line_id
      and (mr.requester_id = (select auth.uid()) or public.has_role('admin'))
  )
);

alter policy generated_documents_select_own_or_admin
on public.generated_documents
using (
  public.is_active_user()
  and exists (
    select 1
    from public.material_requests mr
    where mr.id = request_id
      and (mr.requester_id = (select auth.uid()) or public.has_role('admin'))
  )
);

alter policy storage_generated_documents_select_owner_or_admin
on storage.objects
using (
  bucket_id = 'generated-documents'
  and public.is_active_user()
  and exists (
    select 1
    from public.generated_documents document
    join public.material_requests request on request.id = document.request_id
    where document.storage_path = name
      and (request.requester_id = (select auth.uid()) or public.has_role('admin'))
  )
);

commit;
