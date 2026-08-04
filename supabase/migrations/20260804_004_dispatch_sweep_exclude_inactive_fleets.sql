-- Codex review (PR #1054, P2): fn_auto_dispatch_sweep's order-selection loop
-- checks f.auto_dispatch_enabled but not f.is_active. If a fleet with
-- auto-dispatch on gets deactivated, deactivation doesn't clear the flag,
-- and acceptOrderAction already correctly rejects acceptance for an
-- inactive fleet — but the sweep would keep offering that fleet's orders
-- and pushing notifications to its couriers anyway. Each offer expires
-- (revoke_expired_courier_offers), the sweep offers it again next tick, and
-- couriers in a deactivated fleet get an indefinite stream of offers they
-- can never actually accept.
--
-- Fix: require f.is_active in the sweep's order-selection join, same gate
-- acceptOrderAction already applies. create-or-replace, idempotent, no
-- schema change.

create or replace function public.fn_auto_dispatch_sweep(p_timeout_seconds integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   record;
  v_winner  uuid;
  v_offered integer := 0;
  v_result  jsonb;
begin
  -- Provably inert when the feature is off everywhere: a single cheap EXISTS check
  -- per cron tick when no fleet has opted in.
  if not exists (select 1 from public.courier_fleets where auto_dispatch_enabled and is_active) then
    return 0;
  end if;

  for v_order in
    select co.id, co.fleet_id, co.pickup_lat, co.pickup_lng
      from public.courier_orders co
      join public.courier_fleets f on f.id = co.fleet_id
     where co.status = 'CREATED'
       and co.assigned_courier_user_id is null
       and f.auto_dispatch_enabled
       and f.is_active
     order by co.created_at asc
     limit 50  -- bound the work per tick; the rest are picked up next minute
  loop
    select cand.user_id
      into v_winner
      from (
        select cp.user_id,
               (select count(*)
                  from public.courier_orders a
                 where a.assigned_courier_user_id = cp.user_id
                   and a.status in ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')) as active_load,
               sh.last_lat,
               sh.last_lng
          from public.courier_profiles cp
          join lateral (
            select cs.last_lat, cs.last_lng
              from public.courier_shifts cs
             where cs.courier_user_id = cp.user_id
               and cs.status = 'ONLINE'
             order by cs.started_at desc
             limit 1
          ) sh on true
         where cp.fleet_id = v_order.fleet_id
           and cp.status = 'ACTIVE'  -- offer_courier_order requires ACTIVE-in-fleet
           -- Don't stack a second offer on a courier already holding a pending one.
           and not exists (
             select 1 from public.courier_orders o2
              where o2.assigned_courier_user_id = cp.user_id
                and o2.status = 'OFFERED'
           )
           -- Codex P1 (round 2): don't offer to a courier already at their configured cap.
           and (
             cp.max_parallel_orders is null
             or (
               select count(*)
                 from public.courier_orders a2
                where a2.assigned_courier_user_id = cp.user_id
                  and a2.status in ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')
             ) < cp.max_parallel_orders
           )
      ) cand
     order by
       -- weighted score DESC (mirrors scoreCandidates total: loadScore + distanceScore)
       ( round((5 - least(cand.active_load, 5))::numeric / 5 * 60)
         + case
             when v_order.pickup_lat is null or v_order.pickup_lng is null
               or cand.last_lat is null or cand.last_lng is null
             then 0
             else round((10 - least(
               6371.0 * 2 * asin(sqrt(
                 power(sin(radians(cand.last_lat - v_order.pickup_lat) / 2), 2)
                 + cos(radians(v_order.pickup_lat)) * cos(radians(cand.last_lat))
                   * power(sin(radians(cand.last_lng - v_order.pickup_lng) / 2), 2)
               )), 10))::numeric / 10 * 40)
           end
       ) desc,
       -- exact-tie fallback = original heuristic: load ASC, raw distance ASC, user_id
       cand.active_load asc,
       ( case
           when v_order.pickup_lat is null or v_order.pickup_lng is null
             or cand.last_lat is null or cand.last_lng is null
           then 'Infinity'::float8
           else 6371000.0 * 2 * asin(sqrt(
             power(sin(radians(cand.last_lat - v_order.pickup_lat) / 2), 2)
             + cos(radians(v_order.pickup_lat)) * cos(radians(cand.last_lat))
               * power(sin(radians(cand.last_lng - v_order.pickup_lng) / 2), 2)
           ))
         end
       ) asc,
       cand.user_id asc
     limit 1;

    if v_winner is not null then
      -- Atomic CREATED → OFFERED; loses gracefully if the order was grabbed meanwhile.
      v_result := public.offer_courier_order(v_order.id, v_winner, v_order.fleet_id, p_timeout_seconds);
      if coalesce((v_result ->> 'offered')::boolean, false) then
        v_offered := v_offered + 1;
      end if;
    end if;
  end loop;

  return v_offered;
end;
$$;

comment on function public.fn_auto_dispatch_sweep(integer) is
  'Fleet-level auto-dispatch: OFFERS each open-pool order in an active, '
  'auto_dispatch_enabled fleet to the nearest available online courier under '
  'their max_parallel_orders cap. Inert unless a fleet is active and opted '
  'in. Runs every minute via pg_cron; non-accepted offers revert via '
  'revoke_expired_courier_offers().';
