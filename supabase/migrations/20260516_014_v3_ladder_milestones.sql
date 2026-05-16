-- HIR Reseller v3 — ladder_milestones (Bronze/Silver/Gold/Platinum/Diamond awards)
--
-- One-shot bonuses awarded when a reseller's cumulative DIRECT restaurants
-- referred crosses a threshold. Counts only restaurants currently in
-- partner_referrals.ended_at IS NULL (active tenants).
--
-- Thresholds (v3, RO-calibrated):
--   BRONZE   =   5 rest → €350  cash
--   SILVER   =  15 rest → €1,000 cash
--   GOLD     =  30 rest → €3,000 cash
--   PLATINUM =  50 rest → €7,000 cash + ceremonie
--   DIAMOND  = 100 rest → €20,000 cash + 1% equity vesting 4y/cliff 1
--
-- Each tier can be awarded at most ONCE per partner (unique constraint).
-- Detection job runs in bonus-monthly-calc-v3 cron.

create table if not exists public.ladder_milestones (
  id                      uuid primary key default gen_random_uuid(),
  partner_id              uuid not null references public.partners(id) on delete cascade,
  tier_reached            text not null
    check (tier_reached in ('BRONZE','SILVER','GOLD','PLATINUM','DIAMOND')),
  restaurants_count_at_award int not null check (restaurants_count_at_award > 0),
  bonus_amount_cents      bigint not null check (bonus_amount_cents >= 0),
  -- Equity offers, ceremonies etc. live here as text. Cash bonus separate.
  perks_text              text,
  status                  text not null default 'PENDING'
    check (status in ('PENDING','PAID','VOID')),
  awarded_at              timestamptz not null default now(),
  paid_at                 timestamptz,
  paid_via                text,
  notes                   text,
  created_at              timestamptz not null default now(),
  unique (partner_id, tier_reached)
);

create index if not exists ladder_milestones_partner_idx
  on public.ladder_milestones (partner_id, awarded_at desc);

create index if not exists ladder_milestones_status_idx
  on public.ladder_milestones (status, awarded_at desc);

comment on table public.ladder_milestones is
  'v3 — one-shot ladder awards. Bronze€350 / Silver€1k / Gold€3k / Platinum€7k / Diamond€20k+1% equity. Unique per (partner, tier).';

alter table public.ladder_milestones enable row level security;

-- ============================================================
-- ladder_tiers — canonical thresholds & rewards config
-- ============================================================
create table if not exists public.ladder_tiers (
  tier_reached            text primary key
    check (tier_reached in ('BRONZE','SILVER','GOLD','PLATINUM','DIAMOND')),
  threshold_count         int not null check (threshold_count > 0),
  bonus_amount_cents      bigint not null check (bonus_amount_cents >= 0),
  perks_text              text,
  rank_order              int not null check (rank_order > 0),
  created_at              timestamptz not null default now()
);

insert into public.ladder_tiers (tier_reached, threshold_count, bonus_amount_cents, perks_text, rank_order) values
  ('BRONZE',   5,    35000,     'Tricou RSHIR + featuring pe leaderboard', 1),
  ('SILVER',   15,   100000,    'Diplomă + invitație Forumul Reseller-ilor', 2),
  ('GOLD',     30,   300000,    'Diplomă + ceremonie regională + iPhone (sau echivalent)', 3),
  ('PLATINUM', 50,   700000,    'Ceremonie publică + featuring pe website + invitație advisory call lunar Iulian', 4),
  ('DIAMOND',  100,  2000000,   '1% equity vesting 4y cliff 1 + ceremonie publică + press release + invitație board observer', 5)
on conflict (tier_reached) do nothing;

comment on table public.ladder_tiers is
  'v3 canonical ladder config. Bonus engine reads this to compute milestones; ladder_milestones records actual award events.';

alter table public.ladder_tiers enable row level security;
