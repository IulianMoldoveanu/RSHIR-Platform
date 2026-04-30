-- HIR Restaurant Suite — Reseller / Partner Program
-- Partners are HIR-platform-level entities: one HIR platform has many
-- partners; each partner can refer multiple tenants.
-- No tenant_id on partners itself — visibility is platform-admin-only.
-- Service-role writes only; no public INSERT/UPDATE policies.
-- Idempotent: create table IF NOT EXISTS everywhere.

-- ============================================================
-- partners
-- ============================================================
create table if not exists public.partners (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  email                 text not null unique,
  phone                 text,
  -- Optional: bind a Supabase auth user so a future partner portal can
  -- authenticate. Left null for partner rows created by the operator
  -- before the partner has signed up.
  user_id               uuid references auth.users(id) on delete set null,
  status                text not null default 'ACTIVE'
    check (status in ('ACTIVE','SUSPENDED','REVOKED')),
  -- Default commission % applied to all referrals unless partner_referrals
  -- overrides it. GloriaFood baseline Iulian uses is 20%.
  default_commission_pct numeric(5,2) not null default 20.00
    check (default_commission_pct >= 0 and default_commission_pct <= 100),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ============================================================
-- partner_referrals
-- ============================================================
create table if not exists public.partner_referrals (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners(id) on delete cascade,
  -- A tenant can be referred by at most one partner.
  tenant_id      uuid not null unique references public.tenants(id) on delete cascade,
  -- Overrides default_commission_pct for this specific referral when set.
  commission_pct numeric(5,2)
    check (commission_pct >= 0 and commission_pct <= 100),
  referred_at    timestamptz not null default now(),
  -- Soft-end: cap commissions on orders past this date (churn, breach, etc.).
  ended_at       timestamptz,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists partner_referrals_partner_id_idx
  on public.partner_referrals (partner_id);

-- ============================================================
-- partner_commissions
-- ============================================================
create table if not exists public.partner_commissions (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partners(id) on delete cascade,
  referral_id  uuid not null references public.partner_referrals(id) on delete cascade,
  -- Bucharest local month (e.g., '2026-04-01' = April 2026).
  period_start date not null,
  period_end   date not null,
  -- Integer cents (RON × 100) to avoid float drift.
  amount_cents bigint not null check (amount_cents >= 0),
  order_count  int not null default 0,
  status       text not null default 'PENDING'
    check (status in ('PENDING','PAID','VOID')),
  paid_at      timestamptz,
  paid_via     text,  -- e.g. 'bank_transfer', 'invoice_offset'
  notes        text,
  created_at   timestamptz not null default now(),
  unique (referral_id, period_start, period_end)
);

create index if not exists partner_commissions_partner_id_idx
  on public.partner_commissions (partner_id, period_start desc);

-- ============================================================
-- RLS — no public policies; service-role only for MVP
-- ============================================================
alter table public.partners enable row level security;
alter table public.partner_referrals enable row level security;
alter table public.partner_commissions enable row level security;
