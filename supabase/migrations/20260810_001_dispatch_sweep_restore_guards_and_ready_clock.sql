-- 20260810_001_dispatch_sweep_restore_guards_and_ready_clock.sql
-- ⚠️ REVIEW-READY — apply to prod via the Supabase Management API.
--
-- REGRESSION REPAIR + the correct version of what 20260809_001 was trying to do.
--
-- 20260809_001 rebuilt fn_auto_dispatch_sweep from the June baseline
-- (20260630_038) instead of from the live definition, and `create or replace`
-- silently dropped four guards added since:
--
--   * f.is_active on both the EXISTS guard and the order scan   (20260804_004)
--   * cp.max_parallel_orders cap                                (20260804_003)
--   * public.courier_can_take_orders(cp.user_id) KYC/KYF gate   (20260804_005)
--   * last_seen_at non-null + 5-minute freshness on the shift   (20260804_007)
--
-- All four are restored below, verbatim from 20260804_007, which is the real
-- baseline. Caught by Codex on PR #1067; it was live for roughly half an hour.
-- The lesson is already in the repo from 2026-06-16 — "a faithful copy copies
-- the bug, check the LIVE function" — and this is the inverse of it: never
-- `create or replace` from a migration file without diffing pg_get_functiondef
-- first.
--
-- THE AGE CUT-OFF, corrected. 20260809_001 measured age from
-- courier_orders.created_at on the belief that the row is inserted at
-- DISPATCHED. It is not: 20260727_011 inserts it at PREPARING, so created_at is
-- "kitchen started cooking", not "ready and waiting for a courier". A pre-order
-- accepted four hours ahead, or a genuinely slow prep, would have aged out
-- before the food existed — and then no courier coming online later would ever
-- be offered it. That is worse than the bug it was fixing.
--
-- The clock is now readiness, which 20260727_011 stamps as restaurant_ready_at
-- when the kitchen marks READY (pharma_ready_at is the pharmacy equivalent):
--
--   * not ready yet  → never aged out. It is not the courier's turn.
--   * ready N min ago → after p_max_age_minutes (default 180) stop auto-offering;
--                       a human owns it from there.
--   * plus an absolute 24h backstop on created_at, because the incident rows had
--     no readiness stamp at all and would otherwise still ping forever. Nothing
--     legitimate sits 24h between PREPARING and pickup.
--
-- Aged-out orders are NOT cancelled and NOT hidden: they stay CREATED, so the
-- fleet broadcast and the dispatcher's manual Auto-Assign still reach them.
-- Only the automated pinging stops.
--
-- The orphan guard (HIR_TENANT with no source_tenant_id) and the stuck_created
-- alarm from 20260809_001 were correct and are kept.
--
-- Idempotent: create or replace.

begin;

create or replace function public.fn_auto_dispatch_sweep(
  p_timeout_seconds  integer default 90,
  p_max_age_minutes  integer default 180
)
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

  -- A non-positive or absurd cut-off would silently restore offer-forever.
  if p_max_age_minutes is null or p_max_age_minutes < 1 or p_max_age_minutes > 10080 then
    raise exception 'fn_auto_dispatch_sweep: p_max_age_minutes must be between 1 and 10080, got %',
      p_max_age_minutes;
  end if;

  for v_order in
    select co.id, co.fleet_id, co.pickup_lat, co.pickup_lng
      from public.courier_orders co
      join public.courier_fleets f on f.id = co.fleet_id
     where co.status = 'CREATED'
       and co.assigned_courier_user_id is null
       and f.auto_dispatch_enabled
       and f.is_active
       -- Give up only once the food has actually been waiting for a courier.
       -- Null readiness means the kitchen has not finished; that is not the
       -- courier's problem yet, so it is never aged out on this rule.
       and (
             coalesce(co.restaurant_ready_at, co.pharma_ready_at) is null
          or coalesce(co.restaurant_ready_at, co.pharma_ready_at)
               > now() - make_interval(mins => p_max_age_minutes)
           )
       -- Absolute backstop. Nothing legitimate sits a full day between
       -- PREPARING and pickup, and rows that never get a readiness stamp
       -- (the 2026-08-09 orphans) would otherwise be re-offered forever.
       and co.created_at > now() - interval '24 hours'
       -- A tenant order with no tenant is malformed — never dispatch it.
       and not (co.source_type = 'HIR_TENANT' and co.source_tenant_id is null)
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
               -- Codex P1 (round 6): same staleness rule courier-health-monitor
               -- already applies — an ONLINE shift with no recent ping is not
               -- actually a reachable courier.
               and cs.last_seen_at is not null
               and cs.last_seen_at >= now() - interval '5 minutes'
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
           -- Codex P1 (round 4): don't offer to a courier the fleet's own
           -- KYC gate would block from accepting — same fail-closed rule
           -- courier_can_take_orders() applies everywhere else.
           and public.courier_can_take_orders(cp.user_id)
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

comment on function public.fn_auto_dispatch_sweep(integer, integer) is
  'Fleet-level auto-dispatch: OFFERS each open-pool order in an active, '
  'auto_dispatch_enabled fleet to the nearest available, KYC-eligible, '
  'recently-seen online courier under their max_parallel_orders cap. '
  'Stops auto-offering p_max_age_minutes (default 180) after the order was '
  'marked ready, with a hard 24h backstop for rows that never get a readiness '
  'stamp, and never dispatches a HIR_TENANT row with no source_tenant_id. '
  'Aged-out orders stay CREATED for broadcast + manual assignment. '
  'Inert unless a fleet is active and opted in.';

revoke all on function public.fn_auto_dispatch_sweep(integer, integer) from public;
revoke all on function public.fn_auto_dispatch_sweep(integer, integer) from anon;
revoke all on function public.fn_auto_dispatch_sweep(integer, integer) from authenticated;

commit;
