-- HIR Reseller v3 — partner KYC + activity bonuses
--
-- KYC fields on partners: IBAN + CNP hash + verification status. Required
-- for any payout > €0; manual review for first 3 sub-resellers per sponsor
-- (anti-collusion).
--
-- partner_activity_bonuses: tracks the recurring monthly bonuses (streak,
-- quality, speed, mentor-bronze, quick-win) computed by bonus-monthly-calc-v3.

-- ============================================================
-- partners.* KYC columns
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'iban'
  ) then
    alter table public.partners add column iban text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'cnp_hash'
  ) then
    alter table public.partners add column cnp_hash text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'cui'
  ) then
    alter table public.partners add column cui text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'address'
  ) then
    alter table public.partners add column address text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'kyc_status'
  ) then
    alter table public.partners add column kyc_status text not null default 'UNVERIFIED'
      check (kyc_status in ('UNVERIFIED','PENDING_REVIEW','VERIFIED','REJECTED'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'kyc_verified_at'
  ) then
    alter table public.partners add column kyc_verified_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'kyc_notes'
  ) then
    alter table public.partners add column kyc_notes text;
  end if;

  -- Public testimonial opt-in (used by /parteneriat/leaderboard featuring + +€100 bonus)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'public_testimonial_optin'
  ) then
    alter table public.partners add column public_testimonial_optin boolean not null default false;
  end if;
end$$;

create index if not exists partners_kyc_status_idx
  on public.partners (kyc_status) where kyc_status <> 'VERIFIED';

comment on column public.partners.kyc_status is
  'v3 — required VERIFIED before partner_payouts amount_cents > 0. UNVERIFIED → PENDING_REVIEW → VERIFIED (manual admin step).';

comment on column public.partners.cnp_hash is
  'v3 — sha256 hash of CNP (never store raw). PII protection per GDPR; admin can verify via match.';

-- ============================================================
-- partner_activity_bonuses — recurring monthly bonuses (Layer 4/2b/1b)
-- ============================================================
create table if not exists public.partner_activity_bonuses (
  id                      uuid primary key default gen_random_uuid(),
  partner_id              uuid not null references public.partners(id) on delete cascade,
  -- Bonus types from v3 memo §2:
  --   STREAK = Layer 4 monthly streak (3+ rest in month, €100)
  --   QUALITY = Layer 4 quality (100+ ord/zi avg, €150)
  --   SPEED = Layer 4 speed-to-live (€50 per rest live in <14d) — also Layer 1b QUICK_WIN €100/rest
  --   MENTOR_BRONZE = Layer 2b (€200 when sub hits 5 rest)
  --   QUICK_WIN = Layer 1b (€100 per restaurant closed <14d from reseller signup)
  --   TEAM_BUILDER = Layer 5 (€500 when team brings ≥15 rest in a month)
  --   MENTOR_MONTH = Layer 5 (€1,000 mentor-of-month)
  --   QUARTER_STREAK = Layer 5 (€1,500 quarterly streak)
  --   TESTIMONIAL = +€100 testimonial opt-in one-shot
  bonus_type              text not null
    check (bonus_type in ('STREAK','QUALITY','SPEED','MENTOR_BRONZE','QUICK_WIN','TEAM_BUILDER','MENTOR_MONTH','QUARTER_STREAK','TESTIMONIAL')),
  period_start            date,
  period_end              date,
  amount_cents            bigint not null check (amount_cents >= 0),
  -- Context: e.g. {"sub_partner_id":"uuid","crossed_at":"2026-05-..."}
  context                 jsonb not null default '{}'::jsonb,
  status                  text not null default 'PENDING'
    check (status in ('PENDING','PAID','VOID')),
  awarded_at              timestamptz not null default now(),
  paid_at                 timestamptz,
  paid_via                text,
  notes                   text,
  created_at              timestamptz not null default now()
);

create index if not exists partner_activity_bonuses_partner_idx
  on public.partner_activity_bonuses (partner_id, awarded_at desc);

create index if not exists partner_activity_bonuses_type_period_idx
  on public.partner_activity_bonuses (bonus_type, period_start);

-- For idempotency on monthly bonuses: a (partner, type, period_start) is unique
-- for the recurring types (STREAK, QUALITY, TEAM_BUILDER, MENTOR_MONTH, QUARTER_STREAK)
create unique index if not exists partner_activity_bonuses_recurring_uniq
  on public.partner_activity_bonuses (partner_id, bonus_type, period_start)
  where bonus_type in ('STREAK','QUALITY','TEAM_BUILDER','MENTOR_MONTH','QUARTER_STREAK');

comment on table public.partner_activity_bonuses is
  'v3 — recurring + one-shot bonuses. STREAK/QUALITY/TEAM_BUILDER/MENTOR_MONTH/QUARTER_STREAK are idempotent per (partner,type,period). MENTOR_BRONZE/QUICK_WIN/SPEED/TESTIMONIAL are event-driven.';

alter table public.partner_activity_bonuses enable row level security;
