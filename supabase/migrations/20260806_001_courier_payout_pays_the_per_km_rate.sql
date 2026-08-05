-- ============================================================================
-- The per-km rate a fleet configures is finally the per-km rate it pays.
--
-- 20260615_006 added pickup_fee_cents + per_km_cents to fleet_courier_tariffs
-- and said, in its own header: "this migration does NOT alter the cron logic
-- (cron update in a follow-up)". That follow-up never landed. Since then a
-- fleet could set a distance rate in the admin UI, see it saved, and have it
-- do nothing: fn_generate_courier_payout_periods reads payout_cents only, and
-- fn_set_fleet_pickup_km_tariff mirrors payout_cents := pickup_fee_cents. So
-- "7.50 lei + 3 lei/km" has been paying a flat 7.50 for seven weeks.
--
-- Els courier delivery srl has exactly that tariff live today.
--
-- It could not have been fixed in June: nothing measured distance. It can now
-- — 20260804_009 materialises route_attributed_distance_m per order, already
-- divided by the number of orders the courier was carrying, so summing it
-- never double-counts.
--
-- WHAT A KILOMETRE IS WORTH PAYING FOR
--   Measured metres are real, but they are metres *travelled*, not metres
--   *needed*. Paid strictly, the rate rewards the detour: a courier who learns
--   the system earns more by driving further, and the fleet has no answer.
--   So the billable distance is capped against the trip that was actually
--   asked for:
--
--     reference_km = max(straight_line_km * 1.3, 1.0)
--     billable_km  = min(measured_km, reference_km * km_cap_factor)
--
--   1.3 is the usual urban road-versus-crow-flies ratio; the 1 km floor stops
--   a 200 m hop from capping to nearly nothing. km_cap_factor (default 1.5)
--   belongs to the fleet — it is how much slack it grants for one-way streets,
--   closures and honest wrong turns before it stops paying for the detour.
--   Together they mean a courier is paid in full for anything up to roughly
--   twice the straight-line distance.
--
--   And a missing measurement is NOT zero. GPS off, permission denied, dead
--   battery — route_attributed_distance_m is NULL, and paying zero kilometres
--   would dock a courier for a flat phone. Those deliveries are paid on the
--   reference distance and marked `fleet_km_estimated`, so the fleet can see
--   how often it is paying an estimate instead of a measurement.
--
-- Every line records its own arithmetic in formula_snapshot: measured,
-- straight, reference, cap, billable, and whether it was capped or estimated.
-- A courier who asks "why is this delivery 18.40?" gets an answer.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. How much slack the fleet grants before it stops paying for the detour.
-- ---------------------------------------------------------------------------
alter table public.fleet_courier_tariffs
  add column if not exists km_cap_factor numeric(4,2) not null default 1.50;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fleet_courier_tariffs_km_cap_factor_check'
  ) then
    alter table public.fleet_courier_tariffs
      add constraint fleet_courier_tariffs_km_cap_factor_check
      check (km_cap_factor >= 1.00 and km_cap_factor <= 5.00);
  end if;
end $$;

comment on column public.fleet_courier_tariffs.km_cap_factor is
  'How far past the reference route the fleet still pays per km. 1.5 = pays '
  'in full up to 1.5x the expected road distance, then stops. Guards the '
  'per-km rate against detours without punishing a wrong turn.';

-- ---------------------------------------------------------------------------
-- 2. The billable distance, with its whole derivation returned for the record.
-- ---------------------------------------------------------------------------
create or replace function public.fn_billable_km(
  p_order_id   uuid,
  p_cap_factor numeric default 1.50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o            record;
  v_measured_km  numeric;
  v_straight_km  numeric;
  v_reference_km numeric;
  v_billable_km  numeric;
  v_estimated    boolean := false;
  v_capped       boolean := false;
begin
  select route_attributed_distance_m, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
    into v_o
    from public.courier_orders
   where id = p_order_id;
  if not found then
    return null;
  end if;

  -- Straight line pickup -> dropoff. Without both ends there is no reference,
  -- so nothing can be capped or estimated and the measurement stands alone.
  if v_o.pickup_lat is null or v_o.pickup_lng is null
     or v_o.dropoff_lat is null or v_o.dropoff_lng is null then
    v_straight_km := null;
  else
    v_straight_km := 6371.0 * 2 * asin(sqrt(
      power(sin(radians(v_o.dropoff_lat - v_o.pickup_lat) / 2), 2)
      + cos(radians(v_o.pickup_lat)) * cos(radians(v_o.dropoff_lat))
        * power(sin(radians(v_o.dropoff_lng - v_o.pickup_lng) / 2), 2)
    ));
  end if;

  v_reference_km := case
    when v_straight_km is null then null
    else greatest(v_straight_km * 1.3, 1.0)
  end;

  v_measured_km := case
    when v_o.route_attributed_distance_m is null then null
    else v_o.route_attributed_distance_m / 1000.0
  end;

  if v_measured_km is null then
    -- Not measurable is not zero.
    v_billable_km := coalesce(v_reference_km, 0);
    v_estimated   := v_reference_km is not null;
  elsif v_reference_km is null then
    v_billable_km := v_measured_km;
  else
    v_billable_km := least(v_measured_km, v_reference_km * p_cap_factor);
    v_capped      := v_measured_km > v_reference_km * p_cap_factor;
  end if;

  return jsonb_build_object(
    'measured_km',  round(v_measured_km, 3),
    'straight_km',  round(v_straight_km, 3),
    'reference_km', round(v_reference_km, 3),
    'cap_factor',   p_cap_factor,
    'billable_km',  round(v_billable_km, 3),
    'capped',       v_capped,
    'estimated',    v_estimated
  );
end;
$$;

comment on function public.fn_billable_km(uuid, numeric) is
  'Kilometres a delivery is paid for, capped against the straight-line trip so '
  'the per-km rate cannot be farmed by driving further. Returns the whole '
  'derivation (measured/straight/reference/cap/billable + capped, estimated) '
  'so a payout line can carry its own arithmetic. A NULL measurement is paid '
  'on the reference distance, not as zero.';

revoke execute on function public.fn_billable_km(uuid, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The generator: prefer the distance formula, fall back to the flat rate.
-- ---------------------------------------------------------------------------
create or replace function public.fn_generate_courier_payout_periods(
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_fleet_id     uuid default null  -- null = all fleets (cron); set = one fleet (manual)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_period_id     uuid;
  v_period_status text;
  v_amount        int;
  v_source        text;
  v_dp_id         uuid;
  v_dp_zone       uuid;
  v_dp_payout     int;
  v_fleet_payout  int;
  v_fleet_cod     int;
  v_fleet_pickup  int;
  v_fleet_perkm   int;
  v_fleet_cap     numeric;
  v_tariff_found  boolean;
  v_km            jsonb;
  v_touched       int := 0;
begin
  if p_period_end <= p_period_start then
    raise exception 'period_end must be after period_start';
  end if;

  -- DELIVERED, assigned, city-known orders in the window not yet paid.
  for v_rec in
    select co.id                         as delivery_id,
           co.assigned_courier_user_id   as courier_user_id,
           co.city_id,
           co.fleet_id,
           co.payment_method,
           co.delivered_at
      from public.courier_orders co
     where co.status = 'DELIVERED'
       and co.delivered_at >= p_period_start
       and co.delivered_at <  p_period_end
       and co.assigned_courier_user_id is not null
       and co.city_id is not null
       and (p_fleet_id is null or co.fleet_id = p_fleet_id)
       and not exists (
         select 1 from public.payout_items pi where pi.delivery_id = co.id
       )
     order by co.assigned_courier_user_id, co.delivered_at
  loop
    -- Latest pricing row for this delivery (may not exist in zone-less cities).
    v_dp_id := null; v_dp_zone := null; v_dp_payout := null;
    select dp.id, dp.zone_id, dp.courier_payout_cents
      into v_dp_id, v_dp_zone, v_dp_payout
      from public.delivery_pricings dp
     where dp.delivery_id = v_rec.delivery_id
     order by dp.computed_at desc
     limit 1;

    -- Resolve the fleet tariff: per-zone override first, then fleet-wide flat.
    v_fleet_payout := null; v_fleet_cod := 0; v_source := null;
    v_fleet_pickup := null; v_fleet_perkm := null; v_fleet_cap := 1.50;
    v_tariff_found := false; v_km := null;
    if v_rec.fleet_id is not null then
      if v_dp_zone is not null then
        select payout_cents, cod_bonus_cents, pickup_fee_cents, per_km_cents, km_cap_factor
          into v_fleet_payout, v_fleet_cod, v_fleet_pickup, v_fleet_perkm, v_fleet_cap
          from public.fleet_courier_tariffs
         where fleet_id = v_rec.fleet_id and zone_id = v_dp_zone and valid_until is null
         limit 1;
        if found then
          v_tariff_found := true;
          v_source := 'fleet_zone';
        end if;
      end if;
      if not v_tariff_found then
        select payout_cents, cod_bonus_cents, pickup_fee_cents, per_km_cents, km_cap_factor
          into v_fleet_payout, v_fleet_cod, v_fleet_pickup, v_fleet_perkm, v_fleet_cap
          from public.fleet_courier_tariffs
         where fleet_id = v_rec.fleet_id and zone_id is null and valid_until is null
         limit 1;
        if found then
          v_tariff_found := true;
          v_source := 'fleet_flat';
        end if;
      end if;
    end if;

    -- The distance formula wins whenever the fleet configured either half of
    -- it. payout_cents is only a legacy mirror of pickup_fee_cents written by
    -- fn_set_fleet_pickup_km_tariff, so reading it instead is exactly the bug
    -- this migration exists to fix — it silently drops the per-km half.
    if v_tariff_found and (v_fleet_pickup is not null or v_fleet_perkm is not null) then
      v_km := public.fn_billable_km(v_rec.delivery_id, coalesce(v_fleet_cap, 1.50));
      v_amount := coalesce(v_fleet_pickup, 0)
                + round(coalesce(v_fleet_perkm, 0) * coalesce((v_km ->> 'billable_km')::numeric, 0))
                + case when v_rec.payment_method = 'COD' then coalesce(v_fleet_cod, 0) else 0 end;
      v_source := case
        when coalesce((v_km ->> 'estimated')::boolean, false) then 'fleet_km_estimated'
        else 'fleet_km'
      end;
    elsif v_tariff_found and v_fleet_payout is not null then
      -- Legacy flat fleets, unchanged: v_source is already fleet_zone/fleet_flat.
      v_amount := v_fleet_payout
        + case when v_rec.payment_method = 'COD' then coalesce(v_fleet_cod, 0) else 0 end;
    elsif v_dp_payout is not null then
      v_amount := v_dp_payout;
      v_source := 'zone_default';
    else
      v_amount := 0;
      v_source := 'unrated';
    end if;

    -- Upsert the courier's period for this window (one per courier+window).
    insert into public.payout_periods
      (courier_user_id, city_id, period_start, period_end, status)
    values
      (v_rec.courier_user_id, v_rec.city_id, p_period_start, p_period_end, 'PENDING')
    on conflict (courier_user_id, period_start, period_end) do nothing;

    -- FOR UPDATE serializes this generation against a concurrent approval or a
    -- second generation run: an APPROVE (FOR NO KEY UPDATE) or another
    -- generator blocks on this row until we commit, so the status we read here
    -- can't change under us and the end-of-run totals recompute stays consistent.
    select id, status
      into v_period_id, v_period_status
      from public.payout_periods
     where courier_user_id = v_rec.courier_user_id
       and period_start = p_period_start
       and period_end = p_period_end
     for update;

    -- Never add items to a period the manager already approved/paid.
    if v_period_status is distinct from 'PENDING' then
      continue;
    end if;

    insert into public.payout_items
      (payout_period_id, delivery_id, delivery_pricing_id, amount_cents, source, formula_snapshot)
    values
      (v_period_id, v_rec.delivery_id, v_dp_id, v_amount, v_source,
       jsonb_build_object(
         'source', v_source,
         'fleet_id', v_rec.fleet_id,
         'zone_id', v_dp_zone,
         'payment_method', v_rec.payment_method,
         'generated_by', 'fn_generate_courier_payout_periods'
       )
       -- The arithmetic behind a distance-priced line, so the courier can be
       -- shown why the number is the number.
       || case when v_km is null then '{}'::jsonb else jsonb_build_object(
            'pickup_fee_cents', coalesce(v_fleet_pickup, 0),
            'per_km_cents', coalesce(v_fleet_perkm, 0),
            'cod_bonus_cents',
              case when v_rec.payment_method = 'COD' then coalesce(v_fleet_cod, 0) else 0 end,
            'km', v_km
          ) end)
    on conflict (delivery_id) do nothing;
  end loop;

  -- Recompute totals for every PENDING period in this window.
  with sums as (
    select pi.payout_period_id,
           coalesce(sum(pi.amount_cents), 0) as total_cents,
           count(*)                          as cnt
      from public.payout_items pi
      join public.payout_periods pp on pp.id = pi.payout_period_id
     where pp.period_start = p_period_start
       and pp.period_end = p_period_end
       and pp.status = 'PENDING'
     group by pi.payout_period_id
  ),
  updated as (
    update public.payout_periods pp
       set total_cents = s.total_cents,
           deliveries_count = s.cnt,
           updated_at = now()
      from sums s
     where pp.id = s.payout_period_id
    returning pp.id
  )
  select count(*) into v_touched from updated;

  return v_touched;
end;
$$;

comment on function public.fn_generate_courier_payout_periods(timestamptz, timestamptz, uuid) is
  'Generates courier payout_periods (PENDING) + payout_items from DELIVERED '
  'orders in [start,end). Amount per delivery = pickup_fee + per_km * billable '
  'km (capped against the straight-line trip; a missing GPS trail is paid on '
  'the reference distance and marked fleet_km_estimated) when the fleet '
  'configured a distance tariff, else the legacy flat rate, else the zone '
  'price, else 0 (unrated). COD bonus applies to fleet tariffs only. '
  'Idempotent — a delivery is paid once; never mutates an APPROVED/PAID '
  'period. The fleet pays the courier; HIR only reports.';
