-- RSHIR-28: Storage bucket for tenant branding (logo + cover image).
--
-- Owns ONLY the storage bucket + its RLS. The brand_color and the
-- {logo_url, cover_url} pointers live in tenants.settings.branding (a
-- JSONB key, no schema migration needed thanks to the deep-merge helper
-- from RSHIR-22). Path layout:
--   tenant-branding / {tenant_id}/logo.{ext}
--   tenant-branding / {tenant_id}/cover.{ext}
-- Public-read so the storefront <img> tags resolve without signing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-branding',
  'tenant-branding',
  true,
  4 * 1024 * 1024, -- 4 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tenant_branding_public_read" on storage.objects;
create policy "tenant_branding_public_read"
on storage.objects
for select
to public
using (bucket_id = 'tenant-branding');

drop policy if exists "tenant_branding_tenant_insert" on storage.objects;
create policy "tenant_branding_tenant_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tenant-branding'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "tenant_branding_tenant_update" on storage.objects;
create policy "tenant_branding_tenant_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tenant-branding'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'tenant-branding'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "tenant_branding_tenant_delete" on storage.objects;
create policy "tenant_branding_tenant_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tenant-branding'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
);
