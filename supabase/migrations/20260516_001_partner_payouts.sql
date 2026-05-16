-- HIR Restaurant Suite — Partner Payouts ledger
--
-- Records each actual cash payout to a partner: one row per
-- (partner_id, period_month). Distinct from `partner_commissions`
-- (which is the per-referral calculation) — this is the act of
-- moving money, tracking who paid it, when, with optional proof
-- and notes.
--
-- Closes the reseller payout journey: the cron `partner-commission-calc`
-- still computes monthly commission rows on partner_commissions, and the
-- admin marks each calendar month PAID on the new partner_payouts table.
-- The previous partner_commissions.status='PAID' flow remains intact and
-- untouched for backwards compatibility.
--
-- Service-role writes only; no public INSERT/UPDATE/DELETE policies.
-- Idempotent: create table IF NOT EXISTS.

create table if not exists public.partner_payouts (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid not null references public.partners(id) on delete cascade,
  -- First-of-month (Bucharest local), e.g. '2026-04-01' = April 2026 payout.
  period_month        date not null,
  -- Integer cents (RON × 100) to avoid float drift.
  gross_cents         bigint not null check (gross_cents >= 0),
  -- HIR platform fee withheld from the gross (commission processing,
  -- bank transfer cost, etc.). Defaults to 0 — most early payouts are
  -- 1:1 gross→net while we tune the model.
  platform_fee_cents  bigint not null default 0 check (platform_fee_cents >= 0),
  -- Net amount actually sent to the partner. Stored explicitly rather
  -- than computed so a later policy change does not retroactively
  -- mutate the recorded history.
  net_cents           bigint not null check (net_cents >= 0),
  -- When the operator clicked "Mark paid". Always set on insert; the
  -- table represents completed payouts only (no PENDING state — that
  -- lives on partner_commissions).
  paid_at             timestamptz not null default now(),
  paid_by_user_id     uuid not null references auth.users(id) on delete set null,
  -- Optional URL to an invoice PDF / bank transfer screenshot kept
  -- elsewhere (storage bucket, Drive, etc.). Free-form text — we do
  -- not store the file itself.
  proof_url           text,
  notes               text,
  -- Soft-void marker: when set, the payout is considered cancelled.
  -- The row is kept for audit trail rather than DELETEd.
  voided_at           timestamptz,
  voided_by_user_id   uuid references auth.users(id) on delete set null,
  voided_reason       text,
  created_at          timestamptz not null default now()
);

-- One non-voided payout per partner per month.
-- Voided rows are excluded so the operator can re-record a payout
-- after a void without violating the constraint.
create unique index if not exists partner_payouts_partner_month_active_unique
  on public.partner_payouts (partner_id, period_month)
  where voided_at is null;

create index if not exists partner_payouts_partner_id_idx
  on public.partner_payouts (partner_id, period_month desc);

-- ============================================================
-- RLS — service-role only (matches partners / partner_referrals /
-- partner_commissions pattern from 20260507_003_reseller_program.sql).
-- ============================================================
alter table public.partner_payouts enable row level security;
