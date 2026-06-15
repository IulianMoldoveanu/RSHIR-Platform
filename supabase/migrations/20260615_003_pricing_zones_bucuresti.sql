-- ============================================================================
-- Seed pricing_zones for Bucuresti (4 rings)
-- Iulian directive 2026-06-15: "platforma sa fie perfect functionala in Bucuresti".
--
-- 19-agent audit found:
--   - cities.bucuresti exists, is_active=true.
--   - pricing_zones for Bucuresti = 0 rows (Brasov has 4).
--   - Without pricing_zones, fn_compute_delivery_pricing AFTER-INSERT trigger
--     silently no-ops on every Bucuresti courier_order, leaving the
--     settlement/payout/billing layer empty.
--
-- Geometry origin = Piata Unirii [26.1025, 44.4268] (matches default-city-
-- centers.ts:17 for storefront map centering).
--
-- Fees mirror the Brasov ring catalog scaled for the larger Bucuresti
-- footprint:
--   Z1 0-7 km URBAN          Sect 1-6 core           restaurant 22 RON / courier 16 RON
--   Z2 7-12 km EXTRA_URBAN   Pantelimon/Voluntari    restaurant 32 RON / courier 25 RON
--   Z3 12-18 km EXTRA_URBAN  Otopeni/Buftea/Chitila  restaurant 42 RON / courier 33 RON
--   Z4 18-30 km EXTRA_URBAN  Ilfov outer ring         restaurant 60 RON / courier 48 RON
--
-- Idempotent: insert-where-not-exists on (city_id, name).
-- Operator can tune fees later from /dashboard/admin/cities (when that UI ships).
-- ============================================================================

do $$
declare
  v_buc_id uuid;
begin
  select id into v_buc_id from public.cities where slug = 'bucuresti';

  if v_buc_id is null then
    raise notice 'Bucuresti city row not found - skipping zone seed.';
    return;
  end if;

  -- Z1 — urban core, 0-7 km
  insert into public.pricing_zones
    (city_id, name, zone_type, geometry, max_distance_km,
     restaurant_fee_cents, courier_payout_cents, localities, active)
  select v_buc_id,
         'Bucuresti - Zona 1 (urban, 0-7 km)',
         'URBAN',
         '{"type":"Circle","center":[26.1025,44.4268],"radius_m":7000}'::jsonb,
         7,
         2200, 1600,
         array['Sector 1','Sector 2','Sector 3','Sector 4','Sector 5','Sector 6']::text[],
         true
  where not exists (
    select 1 from public.pricing_zones
     where city_id = v_buc_id
       and name = 'Bucuresti - Zona 1 (urban, 0-7 km)'
  );

  -- Z2 — first ring, 7-12 km
  insert into public.pricing_zones
    (city_id, name, zone_type, geometry, max_distance_km,
     restaurant_fee_cents, courier_payout_cents, localities, active)
  select v_buc_id,
         'Bucuresti - Zona 2 (7-12 km)',
         'EXTRA_URBAN',
         '{"type":"Ring","center":[26.1025,44.4268],"radius_m_min":7000,"radius_m_max":12000}'::jsonb,
         12,
         3200, 2500,
         array['Pantelimon','Voluntari','Popesti-Leordeni','Bragadiru']::text[],
         true
  where not exists (
    select 1 from public.pricing_zones
     where city_id = v_buc_id
       and name = 'Bucuresti - Zona 2 (7-12 km)'
  );

  -- Z3 — second ring, 12-18 km
  insert into public.pricing_zones
    (city_id, name, zone_type, geometry, max_distance_km,
     restaurant_fee_cents, courier_payout_cents, localities, active)
  select v_buc_id,
         'Bucuresti - Zona 3 (12-18 km)',
         'EXTRA_URBAN',
         '{"type":"Ring","center":[26.1025,44.4268],"radius_m_min":12000,"radius_m_max":18000}'::jsonb,
         18,
         4200, 3300,
         array['Otopeni','Buftea','Chitila','Pantelimon-est']::text[],
         true
  where not exists (
    select 1 from public.pricing_zones
     where city_id = v_buc_id
       and name = 'Bucuresti - Zona 3 (12-18 km)'
  );

  -- Z4 — outer ring, 18-30 km (Ilfov satellites)
  insert into public.pricing_zones
    (city_id, name, zone_type, geometry, max_distance_km,
     restaurant_fee_cents, courier_payout_cents, localities, active)
  select v_buc_id,
         'Bucuresti - Zona 4 (18-30 km)',
         'EXTRA_URBAN',
         '{"type":"Ring","center":[26.1025,44.4268],"radius_m_min":18000,"radius_m_max":30000}'::jsonb,
         30,
         6000, 4800,
         array['Ilfov - centura exterioara']::text[],
         true
  where not exists (
    select 1 from public.pricing_zones
     where city_id = v_buc_id
       and name = 'Bucuresti - Zona 4 (18-30 km)'
  );
end $$;
