-- HIR Courier — flip courier-proofs bucket to private (audit §3.1, last P0).
--
-- Authorized by Iulian (no live webhook subscribers depend on the public
-- URL contract today). Read-site refactor in fleet/orders/[id]/page.tsx
-- already mints signed URLs at render time, so this migration is the
-- final step.
--
-- Risk closed: order_id (UUIDv4 — leaks via tracking links + audit
-- artifacts) is no longer enough to fetch courier delivery photos
-- directly from the public bucket. For pharma orders this includes
-- prescription bag + ID. Direct GET on the bucket now returns 401.
--
-- Post-migration:
--   * Bucket is private. Direct GET returns 401.
--   * Authenticated couriers read their own assigned-order proofs via the
--     new SELECT policy (RLS enforced).
--   * Service-role (admin app + signed-URL minter at render time) bypasses
--     RLS — fleet manager + courier own-order-detail surfaces work.
--   * Render sites mint a 1h signed URL when they need to display a photo.
--
-- The existing `assignee_insert` and `assignee_update` policies are kept
-- (they're already gated on the assigned courier — uploads still work
-- end-to-end via the authenticated client).
--
-- Idempotent. Reversible by reapplying public=true on the bucket and
-- restoring the courier_proofs_public_read policy.

update storage.buckets set public = false where id = 'courier-proofs';

drop policy if exists "courier_proofs_public_read" on storage.objects;

drop policy if exists "courier_proofs_assignee_read" on storage.objects;
create policy "courier_proofs_assignee_read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'courier-proofs'
    and exists (
      select 1
      from public.courier_orders co
      where co.id::text = (storage.foldername(name))[1]
        and co.assigned_courier_user_id = auth.uid()
    )
  );

comment on policy "courier_proofs_assignee_read" on storage.objects is
  'Audit §3.1 (2026-05-05): replaces public-read on courier-proofs. Assignee couriers fetch their own proofs via the authenticated client; admin / fleet manager surfaces use service-role to mint signed URLs at render.';
