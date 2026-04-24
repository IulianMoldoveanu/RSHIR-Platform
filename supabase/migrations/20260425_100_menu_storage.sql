-- RSHIR-7: Storage bucket for menu item images.
--
-- Owns ONLY the storage bucket + its RLS. The menu_* tables themselves are
-- created by Sprint 1 (RSHIR-3 / RSHIR-5 schema migrations). This file is
-- intentionally narrow so it can land in any order vs. the schema migrations.
--
-- Depends on:
--   - public.tenant_members (tenant_id uuid, user_id uuid)  ← from Sprint 1
--
-- Path convention enforced by RLS:
--   menu-images / {tenant_id}/{item_id}.{ext}
-- The first path segment MUST be the caller's tenant_id (string-equal to a
-- tenant_id they are a member of).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5 * 1024 * 1024, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read (signed URL not needed for menu images — the storefront is public).
drop policy if exists "menu_images_public_read" on storage.objects;
create policy "menu_images_public_read"
on storage.objects
for select
to public
using (bucket_id = 'menu-images');

-- Authenticated users can write only inside folders matching a tenant_id they
-- belong to. (storage.foldername(name)[1] is the first path segment.)
drop policy if exists "menu_images_tenant_insert" on storage.objects;
create policy "menu_images_tenant_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'menu-images'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "menu_images_tenant_update" on storage.objects;
create policy "menu_images_tenant_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'menu-images'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'menu-images'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "menu_images_tenant_delete" on storage.objects;
create policy "menu_images_tenant_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'menu-images'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
);
