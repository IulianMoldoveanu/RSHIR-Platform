-- 20260810_002_dispatch_unstaffed_fleet_and_fast_alarms.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API.
--
-- Findings from the Bucharest multi-vendor load test (2026-08-10, isolated
-- branch: 20 vendors, 5 fleets, 50 couriers, 320-1670 concurrent orders).
--
-- What the test proved GOOD, so it is not touched here: the atomic offer claim
-- held with 12 couriers racing for one order (exactly one winner); no
-- double-accept; max_parallel_orders respected; no cross-fleet assignment; RLS
-- kept both anon and a non-member authenticated user at zero rows; the open-pool
-- scan uses courier_orders_open_pool_idx and runs in 0.6ms at 1670 open orders,
-- with the whole sweep at ~1.5s once a minute.
--
-- Two things it found:
--
-- 1. A VENDOR WITH NO FLEET ASSIGNMENT PRODUCES UNDELIVERABLE ORDERS, SILENTLY.
--    sync_restaurant_to_courier_order falls back to the first active tier='owner'
--    fleet when fleet_restaurant_assignments has no active row. It never checks
--    whether that fleet has any couriers. In the test, vendor 20's order landed
--    in an owner fleet with zero riders and sat in CREATED forever: the
--    restaurant accepted it, cooked it, marked it READY, and no courier was ever
--    offered it. This is live-relevant — as of 2026-08-09 "HIR Default Fleet",
--    which is that fallback in production, has zero couriers.
--
--    Fix: prefer an owner fleet that actually has an ACTIVE courier. Only if no
--    staffed owner fleet exists does it fall back to the old behaviour (any
--    active owner fleet), so this can never block an order that works today —
--    it only routes better when there is a choice. The pre-existing
--    "no fleet at all" exception is unchanged.
--
-- 2. WHEN THE POOL CANNOT DRAIN, NOTHING SAYS SO.
--    In the rush simulation the pool froze at 170 orders from tick 6 onward —
--    every courier was at their 3-order cap — and the sweep returned 0 offers
--    every minute with no signal anywhere. The stuck_created alarm from
--    20260809_001 only fires at 180 minutes, which is long after a dinner
--    service is lost. Concurrent capacity is exactly
--    couriers x max_parallel_orders (50 x 3 = 150 here), so saturation is
--    normal and expected — it just has to be visible in minutes, not hours.
--
--    Adds two fast signals to courier-health-monitor:
--      * pool_no_candidates    — open orders 10+ min old in an auto-dispatch
--                                fleet that currently has no fresh, eligible,
--                                online courier. This is the "nobody is
--                                reachable" case, including the one where every
--                                courier's heartbeat has gone stale.
--      * orders_unstaffed_fleet — open orders whose fleet has zero ACTIVE
--                                couriers at all. This is finding 1 happening
--                                in production.
--
-- Idempotent: create or replace + unschedule-then-schedule.

begin;

-- ── 1. staffed-fleet preference in the fallback ────────────────────────────
create or replace function public.sync_restaurant_to_courier_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_external_dispatch boolean;
  v_settings          jsonb;
  v_city_id           uuid;
  v_already_exists    uuid;
  v_fleet_id          uuid;
  v_pickup            jsonb;
  v_pickup_line1      text;
  v_pickup_lat        numeric;
  v_pickup_lng        numeric;
  v_pickup_phone      text;
  v_pickup_name       text;
  v_customer          record;
  v_address           record;
begin
  if new.status = 'PREPARING' and (old.status is distinct from 'PREPARING')
     and new.delivery_address_id is not null then
    select external_dispatch_enabled, settings, city_id into v_external_dispatch, v_settings, v_city_id
      from public.tenants where id = new.tenant_id;
    if v_external_dispatch is true then return new; end if;

    select id into v_already_exists from public.courier_orders
      where source_type='HIR_TENANT' and source_tenant_id=new.tenant_id and source_order_id=new.id::text limit 1;
    if v_already_exists is not null then return new; end if;

    select fra.fleet_id into v_fleet_id
      from public.fleet_restaurant_assignments fra
      join public.courier_fleets cf on cf.id = fra.fleet_id
      where fra.restaurant_tenant_id=new.tenant_id and fra.status='active' and cf.is_active=true
      order by fra.assigned_at desc nulls last limit 1;

    -- Load-test finding 1: prefer an owner fleet that has riders. An unstaffed
    -- fallback silently produces an order no courier can ever be offered.
    if v_fleet_id is null then
      select f.id into v_fleet_id
        from public.courier_fleets f
       where f.tier='owner' and f.is_active = true
         and exists (
           select 1 from public.courier_profiles cp
            where cp.fleet_id = f.id and cp.status = 'ACTIVE'
         )
       order by f.created_at asc limit 1;
    end if;
    -- Unchanged last resort, so nothing that works today starts failing.
    if v_fleet_id is null then
      select id into v_fleet_id from public.courier_fleets
       where tier='owner' and is_active=true order by created_at asc limit 1;
    end if;
    if v_fleet_id is null then
      raise exception 'bidi_sync_no_fleet_available for tenant %', new.tenant_id
        using hint='Assign a fleet_restaurant_assignments row, or ensure a tier=owner active fleet exists.';
    end if;

    v_pickup := v_settings->'pickup_address';
    if jsonb_typeof(v_pickup) = 'object' then
      v_pickup_line1 := v_pickup->>'line1';
      v_pickup_lat := nullif(v_pickup->>'lat','')::numeric;
      v_pickup_lng := nullif(v_pickup->>'lng','')::numeric;
      v_pickup_phone := nullif(v_pickup->>'phone','');
      v_pickup_name := nullif(v_pickup->>'name','');
    elsif jsonb_typeof(v_pickup) = 'string' then
      v_pickup_line1 := nullif(v_pickup #>> '{}', '');
      v_pickup_lat := coalesce(
        nullif(v_settings->>'location_lat','')::numeric,
        nullif(v_settings->'location'->>'lat','')::numeric
      );
      v_pickup_lng := coalesce(
        nullif(v_settings->>'location_lng','')::numeric,
        nullif(v_settings->'location'->>'lng','')::numeric
      );
      v_pickup_phone := coalesce(
        nullif(v_settings->>'pickup_phone',''),
        nullif(v_settings->>'whatsapp_phone','')
      );
      v_pickup_name := nullif(v_settings->>'pickup_name','');
    else
      v_pickup_line1 := null; v_pickup_lat := null; v_pickup_lng := null; v_pickup_phone := null; v_pickup_name := null;
    end if;

    select first_name, phone into v_customer from public.customers where id=new.customer_id;
    select line1, latitude, longitude into v_address from public.customer_addresses where id=new.delivery_address_id;

    insert into public.courier_orders (
      fleet_id, city_id, source_type, source_tenant_id, source_order_id,
      customer_first_name, customer_phone, pickup_line1, pickup_lat, pickup_lng,
      pickup_phone, pickup_name, dropoff_line1, dropoff_lat, dropoff_lng,
      items, total_ron, delivery_fee_ron, payment_method, status,
      public_track_token, dropoff_notes
    ) values (
      v_fleet_id, v_city_id, 'HIR_TENANT', new.tenant_id, new.id::text,
      v_customer.first_name, v_customer.phone, v_pickup_line1, v_pickup_lat, v_pickup_lng,
      v_pickup_phone, v_pickup_name, v_address.line1, v_address.latitude, v_address.longitude,
      new.items, new.total_ron, new.delivery_fee_ron,
      case when new.payment_method = 'COD' then 'COD' else 'CARD' end,
      'CREATED', new.public_track_token::text, nullif(new.notes,'')
    );
    return new;
  end if;

  if new.status = 'READY' and (old.status is distinct from 'READY') then
    update public.courier_orders
      set restaurant_ready_at = now(), updated_at = now()
      where source_type='HIR_TENANT' and source_tenant_id=new.tenant_id and source_order_id=new.id::text
        and restaurant_ready_at is null;
    return new;
  end if;

  if new.status='CANCELLED' and (old.status is distinct from 'CANCELLED') then
    update public.courier_orders set status='CANCELLED', updated_at=now()
      where source_type='HIR_TENANT' and source_tenant_id=new.tenant_id and source_order_id=new.id::text
        and status <> 'CANCELLED' and status <> 'DELIVERED';
    return new;
  end if;

  return new;
end;
$fn$;

commit;

-- ── 2. fast alarms on the open pool ────────────────────────────────────────
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'courier-health-monitor';
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule(
    'courier-health-monitor',
    '*/5 * * * *',
    $cron$
    with
      stuck as (
        select count(*) as n from public.courier_orders
        where status = 'PICKED_UP' and updated_at < now() - interval '60 minutes'
      ),
      stuck_open as (
        select count(*) as n from public.courier_orders
        where status = 'CREATED' and assigned_courier_user_id is null
          and created_at < now() - interval '180 minutes'
      ),
      -- Open 10+ minutes in a fleet that auto-dispatches but currently has
      -- nobody reachable: all offline, all heartbeats stale, all KYC-blocked,
      -- or all at their parallel cap.
      no_candidates as (
        select count(*) as n
        from public.courier_orders co
        join public.courier_fleets f on f.id = co.fleet_id
        where co.status = 'CREATED' and co.assigned_courier_user_id is null
          and f.auto_dispatch_enabled and f.is_active
          and co.created_at < now() - interval '10 minutes'
          and not exists (
            select 1
            from public.courier_profiles cp
            join public.courier_shifts cs on cs.courier_user_id = cp.user_id
            where cp.fleet_id = f.id
              and cp.status = 'ACTIVE'
              and cs.status = 'ONLINE'
              and cs.last_seen_at is not null
              and cs.last_seen_at >= now() - interval '5 minutes'
              and public.courier_can_take_orders(cp.user_id)
          )
      ),
      -- Finding 1 in production: the order's fleet has no riders at all.
      unstaffed as (
        select count(*) as n
        from public.courier_orders co
        where co.status = 'CREATED'
          and not exists (
            select 1 from public.courier_profiles cp
            where cp.fleet_id = co.fleet_id and cp.status = 'ACTIVE'
          )
      ),
      offline_ping as (
        select count(*) as n from public.courier_shifts
        where status = 'ONLINE'
          and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')
      ),
      null_tenant as (
        select count(*) as n from public.audit_log
        where created_at > now() - interval '24 hours' and tenant_id is null
      ),
      counts as (
        select stuck.n as stuck_picked_up, stuck_open.n as stuck_created,
               no_candidates.n as pool_no_candidates, unstaffed.n as orders_unstaffed_fleet,
               offline_ping.n as online_no_ping, null_tenant.n as null_tenant_audit
        from stuck, stuck_open, no_candidates, unstaffed, offline_ping, null_tenant
      )
    insert into public.function_runs
      (function_name, started_at, ended_at, status, metadata)
    select
      'courier.healthMonitor', now(), now(), 'SUCCESS',
      jsonb_build_object(
        'stuck_picked_up', stuck_picked_up,
        'stuck_created', stuck_created,
        'pool_no_candidates', pool_no_candidates,
        'orders_unstaffed_fleet', orders_unstaffed_fleet,
        'online_no_ping', online_no_ping,
        'null_tenant_audit', null_tenant_audit,
        'threshold_stuck_minutes', 60,
        'threshold_created_minutes', 180,
        'threshold_no_candidates_minutes', 10,
        'threshold_offline_minutes', 5,
        'anomaly_detected',
          (stuck_picked_up > 0 or stuck_created > 0 or pool_no_candidates > 0
           or orders_unstaffed_fleet > 0 or online_no_ping > 0 or null_tenant_audit > 0)
      )
    from counts;
    $cron$
  );
end$$;
