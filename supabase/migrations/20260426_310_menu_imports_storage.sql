-- RSHIR-13: Private storage bucket for AI menu imports.
--
-- Holds source PDF/JPEG/PNG uploads while Claude Vision extracts menu rows.
-- Files are NOT public; the API parses them via service-role and the human
-- review/commit flow inserts into restaurant_menu_items. Objects expire after
-- ~24h (TODO: wire a pg_cron sweep — for MVP files are short-lived and small).
--
-- Path convention enforced by RLS:
--   menu-imports / {tenant_id}/{upload_id}.{ext}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-imports',
  'menu-imports',
  false,
  8 * 1024 * 1024, -- 8 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated tenant members can write inside their own tenant prefix.
drop policy if exists "menu_imports_tenant_insert" on storage.objects;
create policy "menu_imports_tenant_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'menu-imports'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "menu_imports_tenant_read" on storage.objects;
create policy "menu_imports_tenant_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'menu-imports'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "menu_imports_tenant_delete" on storage.objects;
create policy "menu_imports_tenant_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'menu-imports'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[1]
  )
);

-- TODO(RSHIR-13): schedule a daily job to delete objects older than 24h.
--   Either Supabase Edge Function with pg_cron, or a periodic cron route in
--   restaurant-admin invoking storage.objects DELETE. Tracked as follow-up.
