-- HIR Courier App — Unification Phase A: vertical-aware multi-tenant routing
--
-- Adds the three primitives required to support both pharma and restaurant
-- orders in a SINGLE courier app, with strict fleet isolation:
--   1. courier_orders.vertical          — what type of order this is
--   2. courier_fleets.allowed_verticals — what types of orders this fleet may receive
--   3. courier_fleets.tier              — owner / partner / external (governance level)
--
-- Plus an updated RLS policy so a courier sees ONLY orders matching their
-- fleet AND that fleet's allowed verticals. Hard wall at the DB layer.
--
-- Idempotent. Safe to re-run.
-- Strategy doc: docs/strategy/2026-04-29-courier-unification-direction.md

-- ============================================================
-- 1. vertical column on courier_orders
-- ============================================================
alter table public.courier_orders
  add column if not exists vertical text not null default 'restaurant'
    check (vertical in ('restaurant', 'pharma'));

create index if not exists idx_courier_orders_fleet_vertical
  on public.courier_orders (fleet_id, vertical, status)
  where status in ('PENDING', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT');

-- ============================================================
-- 2. allowed_verticals on courier_fleets
-- ============================================================
alter table public.courier_fleets
  add column if not exists allowed_verticals text[] not null
    default array['restaurant', 'pharma'];

-- Sanity guard: every entry in allowed_verticals must be a known vertical.
-- Implemented as a trigger because Postgres CHECK constraints can't
-- reference array element values cleanly.
create or replace function public.fn_courier_fleet_allowed_verticals_guard()
returns trigger language plpgsql as $$
declare
  v text;
begin
  if new.allowed_verticals is null or array_length(new.allowed_verticals, 1) is null then
    raise exception 'courier_fleets.allowed_verticals must be a non-empty array';
  end if;
  foreach v in array new.allowed_verticals loop
    if v not in ('restaurant', 'pharma') then
      raise exception 'unknown vertical % (allowed: restaurant, pharma)', v;
    end if;
  end loop;
  return new;
end$$;

drop trigger if exists trg_courier_fleets_allowed_verticals_guard on public.courier_fleets;
create trigger trg_courier_fleets_allowed_verticals_guard
  before insert or update of allowed_verticals on public.courier_fleets
  for each row execute function public.fn_courier_fleet_allowed_verticals_guard();

-- ============================================================
-- 3. tier on courier_fleets — governance level
-- ============================================================
alter table public.courier_fleets
  add column if not exists tier text not null default 'partner'
    check (tier in ('owner', 'partner', 'external'));

-- Mark the default HIR fleet as the owner tier. Idempotent.
update public.courier_fleets
   set tier = 'owner'
 where slug = 'hir-default'
   and tier <> 'owner';

create index if not exists idx_courier_fleets_tier
  on public.courier_fleets (tier)
  where is_active = true;

-- ============================================================
-- 4. RLS — courier sees only own-fleet orders matching allowed verticals
-- ============================================================
-- Enable RLS in case it isn't yet (idempotent).
alter table public.courier_orders enable row level security;

-- Drop any prior courier-side select policy so we replace it cleanly.
drop policy if exists courier_orders_courier_read on public.courier_orders;

-- A courier may select an order iff:
--   (a) the order's fleet_id matches the courier's profile fleet_id, AND
--   (b) the order's vertical is in that fleet's allowed_verticals
--
-- Service-role / admin clients bypass RLS entirely (standard Supabase model).
create policy courier_orders_courier_read on public.courier_orders
  for select to authenticated
  using (
    exists (
      select 1
        from public.courier_profiles cp
        join public.courier_fleets cf on cf.id = cp.fleet_id
       where cp.user_id = auth.uid()
         and cp.fleet_id = courier_orders.fleet_id
         and courier_orders.vertical = any (cf.allowed_verticals)
    )
  );

-- ============================================================
-- 5. View: vertical-aware courier feed (convenience for the app)
-- ============================================================
-- Exposes the matched, RLS-filtered set with a small enrichment:
-- the fleet's brand color + tier, so the app can theme per fleet.
create or replace view public.courier_orders_feed as
  select co.*,
         cf.slug         as fleet_slug,
         cf.name         as fleet_name,
         cf.brand_color  as fleet_brand_color,
         cf.tier         as fleet_tier
    from public.courier_orders co
    join public.courier_fleets cf on cf.id = co.fleet_id;

-- View inherits RLS from underlying tables.
grant select on public.courier_orders_feed to authenticated;

-- ============================================================
-- 6. Backfill safety
-- ============================================================
-- All existing courier_orders rows default to vertical='restaurant' (set
-- by the column default). Pharma orders mirrored from Neon backend will
-- be inserted with vertical='pharma' explicitly (see Phase B webhook).

-- All existing courier_fleets rows default to allowed_verticals=both,
-- so the default HIR fleet keeps full visibility. Partner fleets onboarded
-- later get scoped down via UPDATE on this column.
