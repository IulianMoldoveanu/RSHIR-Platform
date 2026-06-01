-- Connect deliveryhouse activation — compute zone-based delivery pricing.
--
-- Ground truth on prod (verified 2026-06-02): the canonical city pricing-rings
-- table is `pricing_zones` (city_id + zone_type + geometry + restaurant_fee_cents
-- + courier_payout_cents + max_distance_km), seeded with the 4 Brașov rings
-- (Z1 0-6km 20/15 · Z2 6-10km 30/24 · Z3 10-14km 35/28 · Z4 14-30km 50/40).
-- `delivery_pricings.zone_id` FK already points to `pricing_zones`. The ONLY gap
-- was that nothing computed the fee when a delivery is created. (Note: the OLD
-- `delivery_zones` table is a different, in-use feature — tenant draw-on-map
-- delivery radius / zone-pause — and is intentionally NOT touched here.)
--
-- This migration adds:
--   • fn_compute_delivery_pricing(delivery_id) — resolves the city ring by
--     straight-line (haversine) distance from the ring origin to the dropoff,
--     applies an active per-tenant override if present, records a
--     delivery_pricings row. Idempotent (skips if already priced).
--   • trg_courier_order_pricing AFTER INSERT on courier_orders — best-effort:
--     wrapped so a pricing hiccup NEVER blocks order creation; cities without
--     pricing_zones simply get no row.
--
-- Distance is haversine v1 (OSRM real-road routing is a later refinement). Zones
-- are concentric rings around a single city origin, so straight-line distance to
-- that origin is a faithful first approximation. Beyond the largest ring (cap) =>
-- no auto price (manual handling).

create or replace function public.fn_compute_delivery_pricing(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city_id uuid;
  v_lat numeric; v_lng numeric;
  v_tenant uuid;
  v_olat numeric; v_olng numeric;
  v_dist_km numeric;
  v_zone record;
  v_rest int; v_payout int;
  v_override_id uuid; v_ov_rest int; v_ov_payout int;
begin
  select city_id, dropoff_lat, dropoff_lng, source_tenant_id
    into v_city_id, v_lat, v_lng, v_tenant
    from public.courier_orders
   where id = p_delivery_id;

  -- Need a city + dropoff coordinates to price.
  if v_city_id is null or v_lat is null or v_lng is null then
    return;
  end if;

  -- Idempotent: never double-price a delivery.
  if exists (select 1 from public.delivery_pricings where delivery_id = p_delivery_id) then
    return;
  end if;

  -- Ring origin = geometry.center ([lng, lat]) of any active zone for the city.
  select (geometry->'center'->>1)::numeric, (geometry->'center'->>0)::numeric
    into v_olat, v_olng
    from public.pricing_zones
   where city_id = v_city_id and active and geometry ? 'center'
   order by max_distance_km asc
   limit 1;

  -- City has no usable pricing rings → nothing to compute.
  if v_olat is null or v_olng is null then
    return;
  end if;

  -- Haversine distance (km) from ring origin to dropoff.
  v_dist_km := 6371 * 2 * asin(least(1, sqrt(
      power(sin(radians(v_lat - v_olat) / 2), 2)
    + cos(radians(v_olat)) * cos(radians(v_lat))
      * power(sin(radians(v_lng - v_olng) / 2), 2)
  )));

  -- Smallest ring whose max_distance_km still covers the distance.
  select * into v_zone
    from public.pricing_zones
   where city_id = v_city_id and active and max_distance_km >= v_dist_km
   order by max_distance_km asc
   limit 1;

  -- Beyond the largest ring (cap exceeded) → manual pricing, no row.
  if v_zone.id is null then
    return;
  end if;

  v_rest := v_zone.restaurant_fee_cents;
  v_payout := v_zone.courier_payout_cents;

  -- Active per-tenant override (valid_until IS NULL = currently active), latest.
  if v_tenant is not null then
    select id, restaurant_fee_cents, courier_payout_cents
      into v_override_id, v_ov_rest, v_ov_payout
      from public.tenant_pricing_overrides
     where tenant_id = v_tenant and zone_id = v_zone.id and valid_until is null
     order by valid_from desc
     limit 1;
    if found then
      v_rest := v_ov_rest;
      v_payout := v_ov_payout;
    else
      v_override_id := null;
    end if;
  end if;

  insert into public.delivery_pricings
    (delivery_id, zone_id, restaurant_fee_cents, courier_payout_cents, formula_snapshot)
  values (
    p_delivery_id, v_zone.id, v_rest, v_payout,
    jsonb_build_object(
      'formula_version', 'v1-haversine',
      'zone_name', v_zone.name,
      'zone_type', v_zone.zone_type,
      'distance_km', round(v_dist_km, 2),
      'override_id', v_override_id,
      'override_active', (v_override_id is not null),
      'computed_by', 'trigger'
    )
  );
end;
$$;

comment on function public.fn_compute_delivery_pricing(uuid) is
  'Resolves the city pricing ring (pricing_zones) for a courier_order by haversine '
  'distance from the ring origin to its dropoff, applies an active tenant override, '
  'and records a delivery_pricings row. Idempotent; no-op when the city has no rings '
  'or the dropoff is beyond the cap. READ-ONLY w.r.t. allocation.';

-- AFTER INSERT trigger — best-effort, must NEVER block order creation.
create or replace function public.trg_courier_order_pricing_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.fn_compute_delivery_pricing(new.id);
  exception when others then
    raise warning 'fn_compute_delivery_pricing failed for % : %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_courier_order_pricing on public.courier_orders;
create trigger trg_courier_order_pricing
  after insert on public.courier_orders
  for each row
  execute function public.trg_courier_order_pricing_fn();

-- Defense-in-depth: these run inside the trigger (definer context); no client
-- should call them directly.
revoke all on function public.fn_compute_delivery_pricing(uuid) from public, anon, authenticated;
revoke all on function public.trg_courier_order_pricing_fn() from public, anon, authenticated;
