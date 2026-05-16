-- HIR Reseller v3 — champion_referrals (restaurant → restaurant viral loop)
--
-- A restaurant patron generates a unique referral code from their admin.
-- When another restaurant signs up via that code:
--   * referrer restaurant gets 1 month free (credit applied to next bill)
--   * referrer restaurant gets €100 cash bonus (paid via partner_payouts-style ledger)
--   * referred restaurant gets 60-day trial (vs 30-day default)
--   * the reseller of the referrer (if any) gets full Y1 direct commission on
--     the referred restaurant (handled in partner-commission-calc v3)
--
-- A tenant can be referred by AT MOST one champion tenant (unique constraint).

create table if not exists public.champion_referrals (
  id                       uuid primary key default gen_random_uuid(),
  referrer_tenant_id       uuid not null references public.tenants(id) on delete restrict,
  referred_tenant_id       uuid not null references public.tenants(id) on delete cascade,
  referred_at              timestamptz not null default now(),
  -- Reward state machine: pending (signup) -> trial_active (referred is in 60d trial)
  --   -> verified (referred completes first paid month) -> paid (reward disbursed)
  --   -> void (referred churned in trial)
  reward_status            text not null default 'pending'
    check (reward_status in ('pending','trial_active','verified','paid','void')),
  free_months_credited     int not null default 0 check (free_months_credited >= 0),
  cash_bonus_cents         bigint not null default 0 check (cash_bonus_cents >= 0),
  trial_extended_days      int not null default 30 check (trial_extended_days >= 0),
  verified_at              timestamptz,
  paid_at                  timestamptz,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (referrer_tenant_id <> referred_tenant_id),
  unique (referred_tenant_id)
);

create index if not exists champion_referrals_referrer_idx
  on public.champion_referrals (referrer_tenant_id, reward_status);

create index if not exists champion_referrals_status_idx
  on public.champion_referrals (reward_status, referred_at desc);

comment on table public.champion_referrals is
  'v3 restaurant-to-restaurant viral loop. Each referred tenant has at most one champion; reward state machine: pending→trial_active→verified→paid (or void).';

alter table public.champion_referrals enable row level security;

-- updated_at trigger
create or replace function public.champion_referrals_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists champion_referrals_updated_at on public.champion_referrals;
create trigger champion_referrals_updated_at
  before update on public.champion_referrals
  for each row execute function public.champion_referrals_set_updated_at();

-- ============================================================
-- tenants.champion_code — per-tenant referral code surface.
-- Generated lazily on first read by the admin UI (8-char base32 from id).
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'champion_code'
  ) then
    alter table public.tenants add column champion_code text;
  end if;
end$$;

create unique index if not exists tenants_champion_code_uniq
  on public.tenants (champion_code)
  where champion_code is not null;

comment on column public.tenants.champion_code is
  'v3 — unique referral code shown to restaurant patron in /dashboard/champion. Used to attribute new tenant signups to the referrer.';

-- ============================================================
-- tenants.powered_by_hir_badge — opt-out toggle for footer badge.
-- Default true (opt-out, not opt-in). 85%+ stay on per v3 strategy.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'powered_by_hir_badge'
  ) then
    alter table public.tenants add column powered_by_hir_badge boolean not null default true;
  end if;
end$$;

comment on column public.tenants.powered_by_hir_badge is
  'v3 Loop 4 — default-on footer badge "Powered by HIR" on restaurant micro-sites. Tenant can opt-out in settings.';
