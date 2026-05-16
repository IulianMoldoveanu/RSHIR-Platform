-- HIR Reseller v3 — reseller_leads (deal registration with 30-day exclusivity)
--
-- When a reseller is pitching a restaurant, they register the lead:
-- contact identifiers (phone/email/CUI) are hashed and locked to that partner
-- for 30 days. If they close in the lock window, they get full credit.
-- If they don't, the lock expires and another reseller can claim it.
-- One extension of 30 more days is allowed with evidence.
--
-- The unique constraint enforces only ONE active lock per contact_hash.
-- closed_won/closed_lost/expired statuses don't trigger the unique violation.

create table if not exists public.reseller_leads (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid not null references public.partners(id) on delete cascade,
  restaurant_name     text not null,
  -- sha256 of normalized lower(coalesce(phone,'') || '|' || coalesce(email,'') || '|' || coalesce(cui,''))
  contact_hash        text not null,
  expected_close_at   timestamptz,
  locked_at           timestamptz not null default now(),
  unlocks_at          timestamptz not null,
  extended            boolean not null default false,
  -- Set when the lead converts to an actual tenant.
  closed_tenant_id    uuid references public.tenants(id) on delete set null,
  closed_at           timestamptz,
  status              text not null default 'active'
    check (status in ('active','closed_won','closed_lost','expired','disputed')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Only ONE active lock per contact at a time. Closed/expired/disputed
-- locks are excluded — allowing next reseller to claim after release.
create unique index if not exists reseller_leads_active_contact_uniq
  on public.reseller_leads (contact_hash)
  where status = 'active';

create index if not exists reseller_leads_partner_idx
  on public.reseller_leads (partner_id, status, locked_at desc);

create index if not exists reseller_leads_unlocks_idx
  on public.reseller_leads (unlocks_at)
  where status = 'active';

comment on table public.reseller_leads is
  'v3 deal registration. 30-day exclusivity lock per contact_hash; one extension allowed. Prevents 2 resellers fighting over same restaurant.';

alter table public.reseller_leads enable row level security;

-- updated_at trigger
create or replace function public.reseller_leads_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists reseller_leads_updated_at on public.reseller_leads;
create trigger reseller_leads_updated_at
  before update on public.reseller_leads
  for each row execute function public.reseller_leads_set_updated_at();

-- Helper: detect and mark expired active locks. Called by cron or on demand.
create or replace function public.reseller_leads_expire_stale()
returns int language plpgsql security definer set search_path = public as $$
declare
  affected int;
begin
  update public.reseller_leads
    set status = 'expired', updated_at = now()
    where status = 'active' and unlocks_at < now();
  get diagnostics affected = row_count;
  return affected;
end$$;

comment on function public.reseller_leads_expire_stale is
  'v3 — flips active locks past unlocks_at to expired. Called by cron or admin tooling.';
