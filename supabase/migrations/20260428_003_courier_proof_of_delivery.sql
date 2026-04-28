-- HIR Courier — proof of delivery (photo).
--
-- Adds two columns to courier_orders for the delivered-photo URL + timestamp,
-- and provisions a Supabase Storage bucket `courier-proofs` with tight RLS:
--   * INSERT/UPDATE: only the assigned courier may upload to their order's
--     folder. Path: `courier-proofs / {order_id}/{filename}`.
--   * SELECT: public-read so the dispatching tenant or end customer can view
--     the proof after delivery. Photos contain only the package + door, no PII
--     beyond what the courier intentionally captures.
--
-- Idempotent.

-- 1. Columns on courier_orders
alter table public.courier_orders
  add column if not exists delivered_proof_url text,
  add column if not exists delivered_proof_taken_at timestamptz;

-- 2. Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-proofs',
  'courier-proofs',
  true,
  6 * 1024 * 1024, -- 6 MB — phone JPEGs comfortably fit
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3. RLS — assigned courier may upload; public may read.
drop policy if exists "courier_proofs_public_read" on storage.objects;
create policy "courier_proofs_public_read"
on storage.objects
for select
to public
using (bucket_id = 'courier-proofs');

drop policy if exists "courier_proofs_assignee_insert" on storage.objects;
create policy "courier_proofs_assignee_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'courier-proofs'
  and exists (
    select 1
    from public.courier_orders co
    where co.id::text = (storage.foldername(name))[1]
      and co.assigned_courier_user_id = auth.uid()
  )
);

drop policy if exists "courier_proofs_assignee_update" on storage.objects;
create policy "courier_proofs_assignee_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'courier-proofs'
  and exists (
    select 1
    from public.courier_orders co
    where co.id::text = (storage.foldername(name))[1]
      and co.assigned_courier_user_id = auth.uid()
  )
)
with check (
  bucket_id = 'courier-proofs'
  and exists (
    select 1
    from public.courier_orders co
    where co.id::text = (storage.foldername(name))[1]
      and co.assigned_courier_user_id = auth.uid()
  )
);
