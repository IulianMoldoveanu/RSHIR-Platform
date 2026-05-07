-- Lane FLEET-ALLOC-P1-FIX — Codex round 3 follow-up on PR #333.
--
-- Background. Migration 20260507_011 added courier_fleets.webhook_secret
-- and "protected" it with a column-level REVOKE SELECT. PostgreSQL behavior:
-- a table-level SELECT grant (which courier_fleets has via the permissive
-- `courier_fleets_public_read` RLS policy from 20260428_002) implicitly
-- grants SELECT on every column; a later column-level REVOKE does NOT
-- subtract from that grant. Verified empirically + already documented in
-- 20260605_004_courier_order_secrets_table.sql header.
--
-- Net effect of the round-1 "fix" in 20260507_011 line 77: every
-- authenticated user could SELECT courier_fleets.webhook_secret and forge
-- HMAC-signed dispatch webhooks against fleets running their own dispatch
-- app. This migration is the real fix.
--
-- Strategy: same sibling-table pattern proven in 20260605_004 for
-- courier_orders. Move webhook_secret to a 1:1 child table with strict
-- deny-all RLS for anon + authenticated. Service-role bypasses RLS, so
-- platform-admin server actions (createAdminClient) keep reading via a
-- SECURITY DEFINER RPC. Drop the now-unused column on courier_fleets.
--
-- Safety: 20260507_011 just merged tonight (2026-05-07) ahead of any
-- production webhook configuration. There are no live `courier_fleets`
-- rows with webhook_secret set yet — but the backfill below is defensive
-- and idempotent in case a fleet OWNER raced ahead.

-- ============================================================
-- 1. fleet_webhook_secrets — sibling table, 1:1 with courier_fleets
-- ============================================================
create table if not exists public.fleet_webhook_secrets (
  fleet_id uuid primary key references public.courier_fleets(id) on delete cascade,
  webhook_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fleet_webhook_secrets is
  'HMAC-SHA256 secrets for fleets that run their own dispatch app (delivery_app=''external''). RLS denies all anon/authenticated access; only service_role reads/writes. Service-role bypasses RLS so the integration-bus dispatcher + admin client keep working. Sibling table to courier_fleets because column-level REVOKE on courier_fleets is overridden by the table-level SELECT grant (see 20260605_004 header for the empirical proof).';

comment on column public.fleet_webhook_secrets.webhook_secret is
  'Internal-only. HMAC-SHA256 shared secret used to sign outbound dispatch payloads when courier_fleets.delivery_app=''external''. Never readable by anon/authenticated under any RLS path. Reads route through fn_get_fleet_webhook_secret() under service_role.';

-- ============================================================
-- 2. RLS — strict deny-all for anon + authenticated
-- ============================================================
alter table public.fleet_webhook_secrets enable row level security;

-- Idempotent re-create.
drop policy if exists fleet_webhook_secrets_no_anon_read  on public.fleet_webhook_secrets;
drop policy if exists fleet_webhook_secrets_no_anon_write on public.fleet_webhook_secrets;
drop policy if exists fleet_webhook_secrets_no_auth_read  on public.fleet_webhook_secrets;
drop policy if exists fleet_webhook_secrets_no_auth_write on public.fleet_webhook_secrets;

-- Block reads.
create policy fleet_webhook_secrets_no_anon_read
  on public.fleet_webhook_secrets for select to anon using (false);
create policy fleet_webhook_secrets_no_auth_read
  on public.fleet_webhook_secrets for select to authenticated using (false);

-- Block writes (insert/update/delete) on the same row scope.
create policy fleet_webhook_secrets_no_anon_write
  on public.fleet_webhook_secrets for all to anon using (false) with check (false);
create policy fleet_webhook_secrets_no_auth_write
  on public.fleet_webhook_secrets for all to authenticated using (false) with check (false);

-- Defense-in-depth: also revoke privilege grants. RLS already blocks every
-- row, but a missing grant means a misconfigured policy can't accidentally
-- expose data. service_role bypasses both RLS and grant checks.
revoke all on public.fleet_webhook_secrets from anon, authenticated;

-- ============================================================
-- 3. Backfill — copy any existing secrets from courier_fleets
-- ============================================================
-- Defensive: 20260507_011 merged tonight, so the realistic count is 0,
-- but we INSERT to be safe + idempotent. ON CONFLICT branch lets the
-- migration re-run cleanly.
insert into public.fleet_webhook_secrets (fleet_id, webhook_secret)
select id, webhook_secret
  from public.courier_fleets
 where webhook_secret is not null
on conflict (fleet_id) do update set
  webhook_secret = excluded.webhook_secret,
  updated_at = now();

-- ============================================================
-- 4. Drop the now-unused column on courier_fleets
-- ============================================================
-- Order matters:
-- (a) drop the constraint that referenced webhook_secret first (the
--     courier_fleets_external_requires_url_chk constraint from 20260507_011
--     required `webhook_url IS NOT NULL AND webhook_secret IS NOT NULL`
--     when delivery_app='external'),
-- (b) drop the column,
-- (c) re-create the constraint without the secret check — the secret now
--     lives in the sibling table; CHECK constraints can't reference other
--     tables, so we enforce secret presence at the application layer
--     (admin actions in fleets/actions.ts validate insert + we add a
--     post-write trigger if needed in a future PR).
alter table public.courier_fleets
  drop constraint if exists courier_fleets_external_requires_url_chk;

alter table public.courier_fleets
  drop column if exists webhook_secret;

alter table public.courier_fleets
  add constraint courier_fleets_external_requires_url_chk
  check (
    delivery_app = 'hir'
    or webhook_url is not null
  );

comment on constraint courier_fleets_external_requires_url_chk
  on public.courier_fleets is
  'External fleets must declare a webhook_url. The matching webhook_secret lives in fleet_webhook_secrets (separate table to avoid the table-level SELECT grant overriding column-level REVOKE on courier_fleets — see 20260507_012 header). Secret presence is enforced application-side in apps/restaurant-courier/src/app/admin/fleets/actions.ts.';

-- ============================================================
-- 5. SECURITY DEFINER RPC for service-role + platform-admin reads
-- ============================================================
-- The integration-bus dispatcher (Edge Function or Next.js server action
-- using the admin client) calls this RPC instead of selecting the table
-- directly. Two reasons:
--   (1) Forces every read through one auditable code path — easier to
--       grep + harden than ad-hoc .from('fleet_webhook_secrets').select()
--       calls scattered across the codebase.
--   (2) `security definer` lets us extend the RPC later to also accept
--       a platform-admin JWT (HIR_PLATFORM_ADMIN_EMAILS allow-list) without
--       loosening the table grants.
--
-- Returns NULL when the fleet has no secret recorded — caller decides
-- whether that's an error (delivery_app='external' but no secret) or a
-- non-event (delivery_app='hir').
create or replace function public.fn_get_fleet_webhook_secret(p_fleet_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select webhook_secret
    from public.fleet_webhook_secrets
   where fleet_id = p_fleet_id;
$$;

comment on function public.fn_get_fleet_webhook_secret(uuid) is
  'Returns the HMAC webhook secret for a fleet, or NULL when none recorded. SECURITY DEFINER + restrictive grants below keep this callable only by service_role (and explicitly NOT by anon/authenticated). Used by integration-bus dispatcher when sending order.dispatched webhooks to external-app fleets.';

-- Lock down the RPC: revoke default PUBLIC EXECUTE, then grant only to
-- service_role. authenticated/anon get nothing.
revoke all on function public.fn_get_fleet_webhook_secret(uuid) from public;
revoke all on function public.fn_get_fleet_webhook_secret(uuid) from anon, authenticated;
grant execute on function public.fn_get_fleet_webhook_secret(uuid) to service_role;

-- ============================================================
-- 6. updated_at trigger (mirrors fleet_alloc_set_updated_at pattern)
-- ============================================================
drop trigger if exists fleet_webhook_secrets_set_updated_at on public.fleet_webhook_secrets;
create trigger fleet_webhook_secrets_set_updated_at
  before update on public.fleet_webhook_secrets
  for each row execute function public.fleet_alloc_set_updated_at();
