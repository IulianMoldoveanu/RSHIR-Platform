-- 20260630_038_courier_auto_dispatch.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API after staging.
-- Merging this file does NOT auto-apply it (this repo applies migrations manually).
--
-- FLEET-LEVEL automatic dispatch (owner ask 2026-06-23). Today allocation is 100%
-- manual: an order lands as CREATED, couriers get a fleet-wide broadcast push, and
-- a human either self-accepts or the dispatcher clicks "Auto-Assign". The proximity
-- engine already exists (apps/restaurant-courier/src/lib/auto-assign-score.ts:
-- load 60 + distance 40, haversine) but only runs behind that manual button.
-- This wires the SAME heuristic to run automatically — no AI, no OSRM.
--
-- DESIGN (deliberately conservative, gated OFF):
--   * Per-fleet opt-in flag courier_fleets.auto_dispatch_enabled (default FALSE) →
--     applying this migration changes NOTHING until a fleet opts in. Global kill =
--     `select cron.unschedule('auto-dispatch-sweep')`.
--   * It OFFERS (offer_courier_order), it does NOT force-assign. The existing
--     revoke_expired_courier_offers() 1-min cron reverts an un-accepted offer back
--     to the pool, so a non-responsive courier self-heals and the next sweep re-offers.
--   * Coexists with the open-pool broadcast: couriers can still self-accept instantly;
--     auto-dispatch is the proximity-aware allocator on top. If no courier is eligible
--     the order simply stays CREATED (broadcast + manual still apply) — never worse
--     than today.
--   * FIREWALL: this lives on the FLEET surface — the fleet auto-allocates its OWN
--     couriers (same-fleet invariant enforced by offer_courier_order). HIR does not
--     dispatch couriers. Consistent with the "HIR nu dispecerizează curierii" line.
--
-- Idempotent (create or replace + if not exists + unschedule-then-schedule).

begin;

-- 1. Per-fleet opt-in. Fast metadata-only add (PG11+) — no table rewrite.
alter table public.courier_fleets
  add column if not exists auto_dispatch_enabled boolean not null default false;

comment on column public.courier_fleets.auto_dispatch_enabled is
  'When true, fn_auto_dispatch_sweep auto-OFFERS open-pool orders in this fleet to '
  'the nearest available online courier (load+distance heuristic). Default false. '
  'Fleet-level allocation only — preserves the courier firewall.';

-- 2. A lightweight partial index for the open-pool scan the sweep runs.
create index if not exists courier_orders_open_pool_idx
  on public.courier_orders (fleet_id, created_at)
  where status = 'CREATED' and assigned_courier_user_id is null;

-- 3. The sweep. Mirrors auto-assign-score.ts exactly so the auto-picked courier
--    matches the manual "Auto-Assign" winner: weighted score (load 60 + distance 40,
--    caps load 5 / distance 10km), then the raw load/distance tiebreak, then user_id
--    for determinism. Returns the number of orders successfully offered.
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
  if not exists (select 1 from public.courier_fleets where auto_dispatch_enabled) then
    return 0;
  end if;

  for v_order in
    select co.id, co.fleet_id, co.pickup_lat, co.pickup_lng
      from public.courier_orders co
      join public.courier_fleets f on f.id = co.fleet_id
     where co.status = 'CREATED'
       and co.assigned_courier_user_id is null
       and f.auto_dispatch_enabled
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
  'Fleet-level auto-dispatch: OFFERS each open-pool order in an auto_dispatch_enabled '
  'fleet to the nearest available online courier (mirrors auto-assign-score.ts). '
  'Inert unless a fleet opts in. Runs every minute via pg_cron; non-accepted offers '
  'revert via revoke_expired_courier_offers().';

revoke all on function public.fn_auto_dispatch_sweep(integer) from public;
revoke all on function public.fn_auto_dispatch_sweep(integer) from anon;
revoke all on function public.fn_auto_dispatch_sweep(integer) from authenticated;

commit;

-- 4. Schedule the sweep (every minute, UTC) — idempotent. Inert until a fleet opts
--    in; disable globally with `select cron.unschedule('auto-dispatch-sweep')`.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'auto-dispatch-sweep';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'auto-dispatch-sweep',
    '* * * * *',
    $cron$ select public.fn_auto_dispatch_sweep(); $cron$
  );
end$$;
