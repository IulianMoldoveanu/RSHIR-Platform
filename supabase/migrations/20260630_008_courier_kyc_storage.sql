-- Private storage bucket for courier KYC documents (fleet marketplace Phase 3).
--
-- The KYC table (20260630_006) stores id_doc_url + selfie_url. Those are ID
-- photos + a selfie -- highly sensitive. They go in a PRIVATE bucket where a
-- courier can only write/read their OWN folder (courier-kyc/{auth.uid()}/...),
-- and the platform reviews them via service_role (signed URLs). Mirrors the
-- own-folder RLS pattern already used for private buckets.
--
-- Idempotent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-kyc',
  'courier-kyc',
  false,                                   -- PRIVATE: never publicly readable
  6 * 1024 * 1024,                         -- 6 MB — phone photos fit
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- INSERT: a courier may upload only into their own {uid}/ folder.
drop policy if exists "courier_kyc_own_insert" on storage.objects;
create policy "courier_kyc_own_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'courier-kyc'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- SELECT: a courier may read only their own {uid}/ folder. Platform review
-- goes through service_role (bypasses RLS) using signed URLs.
drop policy if exists "courier_kyc_own_select" on storage.objects;
create policy "courier_kyc_own_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'courier-kyc'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE (re-upload / upsert into own folder).
drop policy if exists "courier_kyc_own_update" on storage.objects;
create policy "courier_kyc_own_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'courier-kyc'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'courier-kyc'
  and (storage.foldername(name))[1] = auth.uid()::text
);
