-- HIR Courier — move webhook + pharma callback secrets to a sibling table.
--
-- Background. Migration 20260505_006 (PR #229) tried to plug a P1 finding
-- by issuing column-level REVOKE on courier_orders.webhook_secret +
-- pharma_callback_secret. In PostgreSQL, a table-level SELECT grant
-- implicitly grants SELECT on every column; a later column-level REVOKE
-- does NOT subtract from that table grant. Verified empirically:
--
--   select has_column_privilege('authenticated', 'public.courier_orders',
--                               'webhook_secret', 'SELECT');
--   -- still returns TRUE
--
-- Therefore the audit-fix in 20260505_006 is a no-op and any rider on
-- a fleet who can SELECT a courier_orders row can still pull the secret
-- and forge `order.status_changed` webhooks.
--
-- Fix. Move the two secret columns to a 1:1 sibling table with RLS that
-- denies SELECT/INSERT/UPDATE/DELETE for both anon and authenticated,
-- everywhere. Service-role bypasses RLS so server-side reads (Edge
-- Functions + Next.js server actions using the admin client) keep
-- working. The original columns on courier_orders are kept in place
-- for now — phase 2 (post-Iulian-signoff) drops them; that is a
-- mutative migration and out of scope here.
--
-- Strategy. Additive: new table, new policies, backfill of existing
-- rows. No schema break, no data loss, fully reversible by dropping
-- the new table.

-- ============================================================
-- 1. courier_order_secrets — sibling table, 1:1 with courier_orders
-- ============================================================
create table if not exists public.courier_order_secrets (
  courier_order_id uuid primary key references public.courier_orders(id) on delete cascade,
  webhook_secret text,
  pharma_callback_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.courier_order_secrets is
  'Secrets for outbound webhook + pharma callback per courier_order. RLS denies all anon/authenticated access; only service_role reads/writes (Edge Functions + admin client in server actions). Sibling table to courier_orders because column-level REVOKE on courier_orders is overridden by the table-level SELECT grant — see migration 20260605_004 header.';

-- ============================================================
-- 2. RLS — strict deny by default for anon + authenticated
-- ============================================================
alter table public.courier_order_secrets enable row level security;

-- Idempotent re-create.
drop policy if exists courier_order_secrets_no_anon_read       on public.courier_order_secrets;
drop policy if exists courier_order_secrets_no_anon_write      on public.courier_order_secrets;
drop policy if exists courier_order_secrets_no_auth_read       on public.courier_order_secrets;
drop policy if exists courier_order_secrets_no_auth_write      on public.courier_order_secrets;

-- Block reads.
create policy courier_order_secrets_no_anon_read
  on public.courier_order_secrets for select to anon using (false);
create policy courier_order_secrets_no_auth_read
  on public.courier_order_secrets for select to authenticated using (false);

-- Block writes (insert/update/delete) on the same row scope.
-- ALL covers INSERT + UPDATE + DELETE under one policy with USING + WITH CHECK.
create policy courier_order_secrets_no_anon_write
  on public.courier_order_secrets for all to anon using (false) with check (false);
create policy courier_order_secrets_no_auth_write
  on public.courier_order_secrets for all to authenticated using (false) with check (false);

-- Defense-in-depth: also revoke the privilege grants. RLS already
-- blocks every row, but a missing grant means even a misconfigured
-- policy can't accidentally expose data. service_role bypasses both
-- RLS and grant checks.
revoke all on public.courier_order_secrets from anon, authenticated;

-- ============================================================
-- 3. Backfill — copy existing secrets from courier_orders
-- ============================================================
-- Additive: this is an INSERT into a brand-new table. No existing
-- courier_orders row is mutated. The ON CONFLICT branch makes the
-- migration safely re-runnable.
insert into public.courier_order_secrets (courier_order_id, webhook_secret, pharma_callback_secret)
select id, webhook_secret, pharma_callback_secret
  from public.courier_orders
 where webhook_secret is not null or pharma_callback_secret is not null
on conflict (courier_order_id) do update set
  webhook_secret = excluded.webhook_secret,
  pharma_callback_secret = excluded.pharma_callback_secret,
  updated_at = now();
