-- HIR Reseller v3 — partner_sponsors (2-tier override relationships)
--
-- A sub-reseller (sub_partner_id) has exactly ONE sponsor (sponsor_partner_id).
-- The sponsor earns override on what HIR makes from sub's restaurants:
--   * Y1 (within 365d of restaurant signup): override_pct_y1 (default 10%)
--   * Recurring (after 365d, until sunset): override_pct_recurring (default 6%)
-- Sunset: after sunset_at (default sponsor signup + 24mo) override stops.
--
-- Anti-collusion: unique(sub_partner_id) — a sub can only have one sponsor.
-- Self-sponsorship: blocked via CHECK.
-- Service-role writes only; sponsor can read own row via partner_id auth via
-- the partner_portal join (handled at app layer, not RLS here).

create table if not exists public.partner_sponsors (
  id                       uuid primary key default gen_random_uuid(),
  sponsor_partner_id       uuid not null references public.partners(id) on delete restrict,
  sub_partner_id           uuid not null references public.partners(id) on delete cascade,
  override_pct_y1          numeric(5,2) not null default 10.00
    check (override_pct_y1 >= 0 and override_pct_y1 <= 30),
  override_pct_recurring   numeric(5,2) not null default 6.00
    check (override_pct_recurring >= 0 and override_pct_recurring <= 20),
  sunset_at                timestamptz not null default (now() + interval '24 months'),
  -- Total cumulative override paid out under this sponsorship (analytics + audit).
  total_paid_cents         bigint not null default 0 check (total_paid_cents >= 0),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (sponsor_partner_id <> sub_partner_id),
  unique (sub_partner_id)
);

create index if not exists partner_sponsors_sponsor_idx
  on public.partner_sponsors (sponsor_partner_id);

comment on table public.partner_sponsors is
  'v3 2-tier override relationships. sub has exactly one sponsor; sponsor sees aggregate sub stats via app layer.';

-- ============================================================
-- RLS — service-role only writes; admin-only reads via app layer
-- ============================================================
alter table public.partner_sponsors enable row level security;

-- updated_at trigger
create or replace function public.partner_sponsors_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists partner_sponsors_updated_at on public.partner_sponsors;
create trigger partner_sponsors_updated_at
  before update on public.partner_sponsors
  for each row execute function public.partner_sponsors_set_updated_at();
