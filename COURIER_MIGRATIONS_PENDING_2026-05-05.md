# Courier — Pending Migrations (proposed, awaiting apply)

> Sandbox-defensive: I'm proposing 3 production migrations that close the
> remaining audit gaps. Written as a doc rather than committed to
> `supabase/migrations/` so they don't auto-apply on next post-merge run.
> Iulian reviews + I'll commit to a real migration file once you confirm
> the SQL is what you want.

## 1. `20260505_008` — Courier-proofs bucket flip to private (audit §3.1)

**Why now**: zero live webhook subscribers depend on the public URL contract,
so the breaking-change window is open. The bucket leak is the last
P0 security item from the audit.

**SQL**:
```sql
-- Flip bucket visibility.
update storage.buckets set public = false where id = 'courier-proofs';

-- Replace public-read with assignee-read.
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
```

**Code consumer changes (separate PR after migration applies)**:
- `apps/restaurant-courier/src/app/fleet/orders/[id]/page.tsx:297-310` —
  the only render site of `delivered_proof_url`. Mint a signed URL via
  `admin.storage.from('courier-proofs').createSignedUrl(path, 3600)` at
  render time. (The page already uses the admin client for the order
  lookup — service-role can mint.)
- `apps/restaurant-courier/src/lib/proof-uploader.ts:33` — keep
  `getPublicUrl()` (still returns a parseable URL). Only the
  consumer-render side switches.

**Read-site impact analysis** (already done):
- Admin app: zero proof_url renders → unchanged.
- Web app: zero proof_url renders → unchanged.
- Courier app: 1 render at `/fleet/orders/[id]` → refactor inline.
- Webhook payloads: zero subscribers per Iulian → no comms needed.

## 2. `20260505_009` — `cancellation_reason` on courier_orders

**Why**: `forceEndShiftAction` (PR #238) cancels orders but only logs the
reason in `audit_log`. Admin order list / detail surfaces have no way to
show the courier-cited reason inline. Add a dedicated column so dispatchers
can see "courier cancelled — restaurant nu răspunde" without opening the
audit trail.

**SQL**:
```sql
alter table public.courier_orders
  add column if not exists cancellation_reason text;

comment on column public.courier_orders.cancellation_reason is
  'Free-text reason captured at cancellation time (force-end-shift, vendor reject, etc). Distinct from order_status_history which captures every transition.';
```

**Code change after apply**: `forceEndShiftAction` writes the reason
into the column on update. (Plus an admin-side render in the order
detail card.)

## 3. `20260505_010` — Persist pharma proof URLs (id + prescription)

**Why**: audit confirmed bug — `markDeliveredAction` only writes
`delivered_proof_url` (the delivery photo). Pharma orders that capture
ID + prescription proofs upload them but the URLs are lost. For
compliance + dispute resolution, the platform must persist them.

**SQL**:
```sql
alter table public.courier_orders
  add column if not exists delivered_proof_id_url text,
  add column if not exists delivered_proof_prescription_url text;

comment on column public.courier_orders.delivered_proof_id_url is
  'Pharma delivery: signed photo of recipient ID. Required when pharma_metadata.requires_id_check=true.';
comment on column public.courier_orders.delivered_proof_prescription_url is
  'Pharma delivery: signed photo of prescription confirmation. Required when pharma_metadata.requires_prescription=true.';
```

**Code change after apply**:
- `markDeliveredAction` accepts `idProofUrl` + `prescriptionProofUrl` and
  writes them when present (validated through the same
  `isAllowedProofUrl` host allowlist).
- `OrderActions` passes the pharma photo URLs through to the action.
- Pharma fleet-manager order detail page renders the new fields.

## Apply path

Iulian: confirm the SQL above + tell me to commit them as real migrations.
I'll then:
1. Move them into `supabase/migrations/`
2. Apply via Mgmt API (same pattern as 006, 007 already done today)
3. Ship the consumer-side code changes in 2-3 small PRs

Total work: ~2h post-confirmation.
