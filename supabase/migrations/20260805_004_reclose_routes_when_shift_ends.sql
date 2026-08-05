-- Codex review (PR #1055, P2, round 8): the final-leg retry could never run
-- for the last delivery of a shift.
--
-- courier-route-close-final-leg (20260805_002) waits for a GPS sample recorded
-- after the order closed. But record_courier_ping refuses to write anything
-- while the courier has no ONLINE shift, so a courier who delivers their last
-- order and immediately ends their shift produces no such sample — ever. The
-- subquery stays NULL, the order is never revisited, and it keeps the
-- materialisation taken before its closing segment existed.
--
-- Ending a shift is therefore the last moment anything can still be recovered.
-- This trigger takes it: every order the courier closed during that shift is
-- re-measured once more against the trail as it finally stands, picking up any
-- sample that landed between the delivery and the shift ending.
--
-- A trigger rather than endShiftAction, because a shift also goes OFFLINE via
-- forceEndShiftAction and via the courier-health-monitor auto-close, and a
-- recovery that only some of those paths perform is worse than none.
--
-- The guards from 20260804_014 still hold: a purged window stays unmeasured,
-- and a real measurement is never replaced by an empty one. So re-running this
-- is safe even when there is nothing new to find.
--
-- HONEST RESIDUAL: a courier who delivers and ends the shift within seconds,
-- without moving, leaves no post-close sample anywhere. That last delivery
-- keeps a route missing its final leg — at most one sampling interval. There
-- is no data to recover it from, and asking the phone for a fresh fix while
-- the rider waits on the end-shift tap is not worth those metres.

create or replace function public.trg_reclose_routes_on_shift_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select co.id
      from public.courier_orders co
     where co.assigned_courier_user_id = new.courier_user_id
       and co.status in ('DELIVERED', 'CANCELLED')
       and co.route_computed_at is not null
       -- Closed during the shift that is ending.
       and coalesce(co.delivered_at, co.cancelled_at) >= old.started_at
       and coalesce(co.delivered_at, co.cancelled_at) <= now()
     order by coalesce(co.delivered_at, co.cancelled_at) desc
     limit 100
  loop
    perform public.fn_materialise_courier_order_route(v_id);
  end loop;

  return null;
end;
$$;

comment on function public.trg_reclose_routes_on_shift_end() is
  'On shift end, re-measures the orders closed during that shift so the last '
  'delivery is not left with the route it had before its closing GPS sample '
  'arrived. The final chance to recover it — no further samples are accepted '
  'once the courier is OFFLINE.';

revoke execute on function public.trg_reclose_routes_on_shift_end()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_courier_shifts_reclose_routes on public.courier_shifts;

create trigger trg_courier_shifts_reclose_routes
  after update of status on public.courier_shifts
  for each row
  when (new.status = 'OFFLINE' and old.status is distinct from 'OFFLINE')
  execute function public.trg_reclose_routes_on_shift_end();
