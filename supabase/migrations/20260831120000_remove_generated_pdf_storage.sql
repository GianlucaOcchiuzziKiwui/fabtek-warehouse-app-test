delete from storage.objects where bucket_id = 'generated-documents';
drop policy if exists storage_generated_documents_select_owner_or_admin on storage.objects;
delete from storage.buckets where id = 'generated-documents';
