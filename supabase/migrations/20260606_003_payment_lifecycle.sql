-- HIR Restaurant Suite — payment lifecycle additive schema
-- Adds refund/dispute/cancel tracking columns to restaurant_orders and a
-- payment_disputes table for Stripe Radar/dispute webhook intake.
-- Idempotent: safe to re-apply.
--
-- Note: restaurant_orders.status remains a text column with a CHECK
-- constraint (verified in 20260425_000_initial.sql). No enum mutation
-- required — we only add nullable columns.
-- payment_disputes is admin-only (PLATFORM_ADMIN); merchants never see
-- the dispute table directly. RLS denies all authenticated access; reads
-- happen via service-role from server actions.

-- ============================================================
-- Order-level lifecycle columns
-- ============================================================
alter table public.restaurant_orders
  add column if not exists refunded_at timestamptz;
alter table public.restaurant_orders
  add column if not exists refund_reason text;
alter table public.restaurant_orders
  add column if not exists refund_amount_bani bigint;
alter table public.restaurant_orders
  add column if not exists disputed boolean not null default false;
alter table public.restaurant_orders
  add column if not exists cancelled_at timestamptz;
alter table public.restaurant_orders
  add column if not exists cancellation_reason text;

-- ============================================================
-- Disputes table (Stripe charge.dispute.* webhook target)
-- ============================================================
create table if not exists public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.restaurant_orders(id) on delete set null,
  stripe_dispute_id text unique,
  amount_bani bigint,
  reason text,
  status text,
  evidence_due_by timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_disputes_status_idx
  on public.payment_disputes(status);
create index if not exists payment_disputes_order_idx
  on public.payment_disputes(order_id);

alter table public.payment_disputes enable row level security;

-- Default-deny for authenticated. Service-role bypasses RLS, so admin
-- surfaces use getSupabaseAdmin() from server actions.
drop policy if exists payment_disputes_admin_only on public.payment_disputes;
create policy payment_disputes_admin_only
  on public.payment_disputes
  for all
  to authenticated
  using (false)
  with check (false);
