-- Codex review (PR #1055, 2×P2, round 13). Both are the same root: there are
-- three ways a courier comes to hold an order, and the previous migrations only
-- got two of them right.
--
--   1. Ordinary: OFFERED (assignee set) -> ACCEPTED.
--      courier_assigned_at lands at the offer, before the accept, so
--      fn_route_window_start picks accepted_at. Correct already.
--
--   2. Admin re-offer (/api/dispatch/reassign): ACCEPTED -> OFFERED with a new
--      assignee, who then accepts. accepted_at still belongs to the PREVIOUS
--      courier, and courier_assigned_at was stamped at the re-offer — so the
--      window opened when the offer was made, and everything the new courier
--      drove while merely deciding was charged to this order. Wrong.
--
--   3. Fleet direct reassignment: the order stays ACCEPTED and only the
--      assignee changes. courier_assigned_at moves to that moment, which is
--      right — but the accept anchor (20260805_007) fires on status
--      transitions, and there is no status transition here. So the new
--      courier's window opens mid-segment against a stationary marker from
--      before they had the order, and collects a time-prorated sliver of their
--      departure: exactly the 7x undercount that migration was written to
--      remove, still alive on this path.
--
-- Fix, in both cases, is to make the existing mechanisms cover the path they
-- were missing rather than add a third concept:
--
--   * courier_assigned_at is stamped on the ACCEPTED transition too, so a
--     re-offered order's window opens when the new courier actually took it,
--     not when they were asked. Harmless for case 1, where the two instants
--     are the same.
--   * the anchor also fires when the assignee changes on an already-ACCEPTED
--     order.

create or replace function public.stamp_courier_assigned_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_courier_user_id is not null then
      new.courier_assigned_at := coalesce(new.courier_assigned_at, now());
    end if;
    return new;
  end if;

  -- A genuine change of assignee, including the first one. Unassignment
  -- (-> null) leaves the last stamp alone: it costs nothing and keeps the
  -- history of who last held the order.
  if new.assigned_courier_user_id is not null
     and new.assigned_courier_user_id is distinct from old.assigned_courier_user_id
  then
    new.courier_assigned_at := now();
  end if;

  -- Taking the order is also a start, and on a re-offered order it is the only
  -- honest one: accepted_at still names the courier who had it before.
  if new.status = 'ACCEPTED'
     and old.status is distinct from new.status
     and new.assigned_courier_user_id is not null
  then
    new.courier_assigned_at := now();
  end if;

  return new;
end;
$$;

comment on function public.stamp_courier_assigned_at() is
  'Keeps courier_orders.courier_assigned_at at the moment the CURRENT courier '
  'came to hold the order — whether by being offered it, by accepting it, or '
  'by direct reassignment.';

-- The stamping trigger fired only on `update of assigned_courier_user_id`, so
-- the ACCEPTED branch above would never have run — accepting an order touches
-- status, not the assignee. Caught by the test for this migration, which
-- returned the identical number with and without the change.
drop trigger if exists trg_courier_assigned_at on public.courier_orders;

create trigger trg_courier_assigned_at
  before insert or update of assigned_courier_user_id, status on public.courier_orders
  for each row
  execute function public.stamp_courier_assigned_at();

-- The anchor's "have they moved" test compared presence against the last trail
-- point — but both are written by the SAME fix, so for a moving courier they
-- always agree and the check passes trivially. It would then stamp a marker at
-- a position the courier had already left.
--
-- The signal that actually separates the two cases is which is FRESHER.
-- Standing still, fixes keep arriving and are suppressed by the displacement
-- filter, so presence runs ahead of the trail. Moving, every fix writes a trail
-- point too, and the two timestamps stay level. Requiring presence to be
-- meaningfully newer means the marker is only written when there is evidence of
-- a suppressed fix — that is, of a standstill.
create or replace function public.fn_anchor_courier_position(p_courier_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_min_displacement_m constant double precision := 15;
  c_max_presence_age   constant interval := interval '5 minutes';
  -- Presence must lead the trail by at least this much for a standstill to be
  -- the only explanation.
  c_min_presence_lead  constant interval := interval '20 seconds';

  v_lat   numeric;
  v_lng   numeric;
  v_at    timestamptz;
  v_slat  numeric;
  v_slng  numeric;
  v_sseen timestamptz;
begin
  if p_courier_user_id is null then
    return;
  end if;

  select clp.lat, clp.lng, clp.recorded_at
    into v_lat, v_lng, v_at
    from public.courier_location_pings clp
   where clp.courier_user_id = p_courier_user_id
   order by clp.recorded_at desc
   limit 1;

  if v_lat is null then
    return;
  end if;

  select cs.last_lat, cs.last_lng, cs.last_seen_at
    into v_slat, v_slng, v_sseen
    from public.courier_shifts cs
   where cs.courier_user_id = p_courier_user_id
     and cs.status = 'ONLINE'
   order by cs.started_at desc
   limit 1;

  if v_slat is null or v_slng is null or v_sseen is null then
    return;
  end if;

  -- Stale presence proves nothing about where they are now.
  if v_sseen < now() - c_max_presence_age then
    return;
  end if;

  -- Presence has not outlived the trail: no suppressed fix, so no evidence the
  -- courier has been standing still since that point.
  if v_sseen < v_at + c_min_presence_lead then
    return;
  end if;

  -- They HAVE moved since the last trail point, so the trail already describes
  -- the journey and proration across it is honest.
  if public.fn_haversine_m(v_lat, v_lng, v_slat, v_slng) >= c_min_displacement_m then
    return;
  end if;

  -- Carry the TRAIL's coordinates, not presence's: presence accepts fixes of
  -- any accuracy, and the two are within 15 m of each other by the check above.
  insert into public.courier_location_pings (courier_user_id, lat, lng, accuracy_m)
  values (p_courier_user_id, v_lat, v_lng, null);
end;
$$;

revoke execute on function public.fn_anchor_courier_position(uuid)
  from public, anon, authenticated, service_role;

-- The accept anchor must also cover reassignment that never changes status.
drop trigger if exists trg_courier_orders_anchor_on_reassign on public.courier_orders;

create trigger trg_courier_orders_anchor_on_reassign
  after update of assigned_courier_user_id on public.courier_orders
  for each row
  when (
    new.assigned_courier_user_id is not null
    and new.assigned_courier_user_id is distinct from old.assigned_courier_user_id
    and new.status = 'ACCEPTED'
  )
  execute function public.trg_anchor_position_on_accept();
