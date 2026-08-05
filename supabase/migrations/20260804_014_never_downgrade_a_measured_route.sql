-- Codex review (PR #1055, P2, round 4): the sibling re-measure loop could
-- erase preserved distances once the raw trail was gone.
--
-- THE HOLE
--   Closing an order re-materialises the already-closed orders it shared road
--   with, so a batch agrees regardless of the order the courier tapped them in
--   (20260804_009). But that loop calls the measurement unconditionally, and
--   the measurement reads courier_location_pings — which is purged at 30 days.
--   Close a stale order late (a zombie IN_TRANSIT that dispatch force-cancels
--   six weeks on) and its overlap predicate reaches back across the retention
--   horizon, re-measures siblings whose pings no longer exist, gets NULL, and
--   writes that over numbers that were materialised precisely so they would
--   outlive the purge. The feature's whole reason for materialising, undone by
--   its own consistency loop.
--
-- TWO GUARDS, BECAUSE EACH MISSES WHAT THE OTHER CATCHES
--
--   1. Only re-measure siblings whose trail is still WHOLLY inside retention.
--      Codex proposed skipping fully-purged siblings; the sharper case is
--      PARTIAL purge — a sibling whose window straddles the 30-day boundary
--      still returns a non-NULL distance, just a quietly smaller one. A null
--      check alone would wave that through. Gating on accepted_at covers both,
--      because the purge deletes by recorded_at and a window that starts
--      inside retention cannot have lost any of its points.
--
--   2. Never replace a measured distance with an unmeasured one. Broader than
--      the purge: any future path that re-measures with the trail missing is
--      refused. Harmless for a first materialisation, where there is nothing
--      to lose — which is why an order that genuinely had GPS off still
--      records its honest points=0 result.
--
--   The horizon below must track the retention window in 20260804_008's
--   courier-location-trail-30day-purge cron. If one moves, move both.

create or replace function public.fn_materialise_courier_order_route(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route jsonb;
begin
  v_route := public.fn_courier_order_route(p_order_id);

  -- Touches no status column, so the trigger's WHEN clause cannot re-fire on
  -- the row version this produces.
  update public.courier_orders
     set route_distance_m            = (v_route ->> 'distance_m')::integer,
         route_pickup_distance_m     = (v_route ->> 'pickup_distance_m')::integer,
         route_attributed_distance_m = (v_route ->> 'attributed_distance_m')::integer,
         route_points                = (v_route ->> 'points')::integer,
         route_computed_at           = now()
   where id = p_order_id
     -- Guard 2: a real measurement may always be written; an unmeasured result
     -- may only be written when no measurement is being lost.
     and (
       (v_route ->> 'distance_m') is not null
       or route_distance_m is null
     );
end;
$$;

comment on function public.fn_materialise_courier_order_route(uuid) is
  'Measures one courier order and writes the aggregate onto its row, refusing '
  'to overwrite an existing measured distance with an unmeasured one. '
  'INTERNAL: reachable only from trg_compute_courier_order_route, which runs '
  'as definer. No role holds EXECUTE, deliberately: re-running it after the '
  '30-day trail purge would otherwise overwrite preserved distances.';

create or replace function public.trg_compute_courier_order_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Mirrors courier-location-trail-30day-purge (20260804_008).
  c_trail_retention interval := interval '30 days';
  v_sibling uuid;
begin
  perform public.fn_materialise_courier_order_route(new.id);

  -- An order that is still open has no delivered_at, so it reads as "active
  -- until now()" — which means the FIRST order of a batch to close sees its
  -- siblings as sharing every segment, including ones they had already
  -- finished with. Left alone, the order in which a courier happens to tap
  -- "delivered" would change the numbers.
  --
  -- So closing an order re-measures the already-closed orders whose windows
  -- overlapped it. Each close makes the picture more complete, and the last
  -- one to close leaves every member of the batch agreeing. Bounded by real
  -- concurrency (courier_profiles.max_parallel_orders), not by history.
  if new.assigned_courier_user_id is not null and new.accepted_at is not null then
    for v_sibling in
      select o.id
        from public.courier_orders o
       where o.assigned_courier_user_id = new.assigned_courier_user_id
         and o.id <> new.id
         and o.status in ('DELIVERED', 'CANCELLED')
         and o.accepted_at is not null
         -- windows overlap
         and o.accepted_at <= coalesce(new.delivered_at, new.cancelled_at, now())
         and coalesce(o.delivered_at, o.cancelled_at) >= new.accepted_at
         -- Guard 1: only re-measure a sibling whose trail is still complete.
         -- Past the horizon its points are partly or wholly purged, and a
         -- re-measurement would silently shrink or erase a stored result.
         and o.accepted_at >= now() - c_trail_retention
    loop
      perform public.fn_materialise_courier_order_route(v_sibling);
    end loop;
  end if;

  return null;
end;
$$;

comment on function public.trg_compute_courier_order_route() is
  'AFTER UPDATE trigger body: materialises the closing order''s route, then '
  're-materialises the already-closed orders it shared road with — but only '
  'those still inside the GPS trail retention window, so a late close can '
  'never re-measure a batch whose raw points have been purged.';

-- These are trigger-internal; keep them off the RPC surface (20260804_013).
revoke execute on function public.fn_materialise_courier_order_route(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.trg_compute_courier_order_route()
  from public, anon, authenticated, service_role;
