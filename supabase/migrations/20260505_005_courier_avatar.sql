-- HIR Courier — profile photo (avatar).
--
-- Adds avatar_url to courier_profiles + provisions Supabase Storage bucket
-- `courier-avatars` for couriers to upload a profile picture. Mirrors the
-- pattern from 20260428_003 (courier-proofs):
--   * INSERT/UPDATE: only the courier may upload to their own folder.
--     Path: `courier-avatars / {user_id}/{filename}`.
--   * SELECT: public-read (small thumbnails shown to dispatchers / fleet
--     managers in the assignment UI; nothing privacy-sensitive here).
--
-- Idempotent.

alter table public.courier_profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-avatars',
  'courier-avatars',
  true,
  2 * 1024 * 1024, -- 2 MB — even an unoptimized 4032px iPhone photo fits after the client-side downscale we apply.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "courier_avatars_public_read" on storage.objects;
create policy "courier_avatars_public_read"
on storage.objects
for select
to public
using (bucket_id = 'courier-avatars');

drop policy if exists "courier_avatars_self_insert" on storage.objects;
create policy "courier_avatars_self_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'courier-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "courier_avatars_self_update" on storage.objects;
create policy "courier_avatars_self_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'courier-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'courier-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "courier_avatars_self_delete" on storage.objects;
create policy "courier_avatars_self_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'courier-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
