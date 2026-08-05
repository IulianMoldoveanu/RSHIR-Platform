-- Fix non-deterministic delivery zone/tier resolution at checkout.
--
-- findEnclosingZoneId() and findTierForDistance() in
-- apps/restaurant-web/src/app/api/checkout/pricing.ts order candidates by
-- sort_order ASC only, then return the first match. sort_order defaults to
-- 0 and, until #1003, every zone/tier ever created landed at 0 unless an
-- admin manually reordered it — so any tenant with overlapping zones (or
-- multiple tiers) created before that fix has ties. PostgreSQL does not
-- guarantee stable ordering for tied ORDER BY keys, so which zone/tier
-- "wins" for the same address/distance can flip between requests.
--
-- delivery_zones already has created_at (now used as the secondary sort
-- key alongside sort_order); delivery_pricing_tiers does not, so add it
-- here. All existing rows get the same default now(), which would still
-- tie — backfill them to a stable order derived from id instead, spacing
-- rows 1 second apart per tenant so ties resolve consistently and the
-- ordering is reproducible if this migration is ever re-run.
alter table public.delivery_pricing_tiers
  add column if not exists created_at timestamptz not null default now();

with ranked as (
  select id, row_number() over (partition by tenant_id order by id) as rn
  from public.delivery_pricing_tiers
)
update public.delivery_pricing_tiers t
set created_at = date_trunc('day', now()) + (ranked.rn || ' seconds')::interval
from ranked
where t.id = ranked.id;
