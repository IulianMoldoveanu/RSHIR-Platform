-- HIR Courier — capability flags (Tier 1 #4 from Design Bible 2026-05-03)
--
-- Adds the unification primitive the dispatch algorithm uses to filter
-- couriers per offer. Wolt model: same app, different task pools, gated by
-- a boolean array on the courier profile.
--
-- Initial vocabulary (extensible — new entries are added in later migrations
-- when verticals expand):
--   pharma     — courier completed pharma certification (ID/Rx flow)
--   cash       — courier accepts cash-on-delivery (with cash ledger reconciliation)
--   alcohol    — courier verified for age-gated alcohol delivery
--
-- Vehicle is already on the profile — kept separate from `capabilities` because
-- vehicle is the courier's *physical* state, capabilities are *learned* permits.
--
-- The dispatch algorithm (see docs/strategy/2026-04-29-courier-unification-direction.md)
-- filters: courier.capabilities ⊇ order.required_capabilities.
--
-- Idempotent. Safe to re-run.

-- ============================================================
-- 1. capabilities column on courier_profiles
-- ============================================================
alter table public.courier_profiles
  add column if not exists capabilities text[] not null default '{}';

-- Sanity guard: every entry must be a known capability.
-- Implemented as a trigger because Postgres CHECK can't reference array
-- element values cleanly (same approach as allowed_verticals on fleets).
create or replace function public.fn_courier_profile_capabilities_guard()
returns trigger language plpgsql as $$
declare
  v text;
  known constant text[] := array['pharma', 'cash', 'alcohol'];
begin
  if new.capabilities is null then
    new.capabilities := '{}'::text[];
  end if;
  foreach v in array new.capabilities loop
    if not (v = any (known)) then
      raise exception 'unknown courier capability % (allowed: %)', v, known;
    end if;
  end loop;
  return new;
end$$;

drop trigger if exists trg_courier_profile_capabilities_guard on public.courier_profiles;
create trigger trg_courier_profile_capabilities_guard
  before insert or update of capabilities on public.courier_profiles
  for each row execute function public.fn_courier_profile_capabilities_guard();

-- GIN index for fast `capabilities @> array['pharma']` style filters in
-- dispatch queries. Practical impact only at >1000 couriers; cheap to keep.
create index if not exists idx_courier_profiles_capabilities
  on public.courier_profiles using gin (capabilities);

-- ============================================================
-- 2. required_capabilities column on courier_orders
-- ============================================================
-- Order-side mirror: which capabilities a courier MUST have to be eligible.
-- Empty array = no restriction (default for restaurant orders).
alter table public.courier_orders
  add column if not exists required_capabilities text[] not null default '{}';

create index if not exists idx_courier_orders_required_capabilities
  on public.courier_orders using gin (required_capabilities);

-- ============================================================
-- 3. Auto-populate required_capabilities for pharma orders
-- ============================================================
-- When the courier-mirror-pharma webhook inserts a pharma order, it sets
-- vertical='pharma' + pharma_metadata. We auto-derive required_capabilities
-- so the dispatch filter doesn't need to special-case verticals.
create or replace function public.fn_courier_orders_derive_capabilities()
returns trigger language plpgsql as $$
begin
  -- Pharma orders always require the pharma capability.
  if new.vertical = 'pharma' then
    if not (new.required_capabilities @> array['pharma']) then
      new.required_capabilities := array_append(new.required_capabilities, 'pharma');
    end if;
  end if;
  -- COD orders require the cash capability.
  if new.payment_method = 'COD' then
    if not (new.required_capabilities @> array['cash']) then
      new.required_capabilities := array_append(new.required_capabilities, 'cash');
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_courier_orders_derive_capabilities on public.courier_orders;
create trigger trg_courier_orders_derive_capabilities
  before insert or update of vertical, payment_method on public.courier_orders
  for each row execute function public.fn_courier_orders_derive_capabilities();

-- Backfill: re-tag existing pharma + COD rows.
update public.courier_orders
   set vertical = vertical
 where vertical = 'pharma' or payment_method = 'COD';
