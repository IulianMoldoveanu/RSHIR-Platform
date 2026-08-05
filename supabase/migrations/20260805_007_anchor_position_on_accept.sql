-- Codex review (PR #1055, P2, round 12): the opening leg was prorated across a
-- standstill the courier had already finished.
--
-- A courier waits outside a vendor. The last trail point is a stationary marker
-- from up to three minutes ago (20260805_006). They accept an order and ride
-- away; the first movement fix lands thirty seconds later, 450 m on. The route
-- sees one segment spanning marker -> movement, 450 m over 210 s, and prorates
-- it by time: the order's window covers only the last 30 s, so it is credited
-- 30/210 of the distance — about 75 m of the 450 m they actually rode for it.
--
-- Proration by time assumes constant speed across the segment. That is the
-- right default when nothing better is known, and wrong here, because the
-- courier was demonstrably parked for most of it.
--
-- Shortening the keepalive does not fix this, it only shrinks the lie: at a
-- 60-second interval the same departure still collects 150 m of 450 m. The
-- missing fact is not resolution, it is "where were they at the moment they
-- accepted" — and that is knowable precisely then.
--
-- So the accept records it. If the courier's live presence is still within the
-- displacement threshold of their last trail point, they have not moved since
-- it, and a marker at those coordinates timestamped now() is simply true. The
-- window then opens on a point rather than in the middle of a segment: the
-- standstill before it contributes zero, and the ride after it counts in full.
--
-- One row per accepted order, not one per interval.

create or replace function public.fn_anchor_courier_position(p_courier_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_min_displacement_m constant double precision := 15;
  -- Same staleness rule dispatch uses: past this we do not claim to know where
  -- the courier is.
  c_max_presence_age   constant interval := interval '5 minutes';

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

  -- No trail yet: nothing to anchor to, and the first real fix will open the
  -- window cleanly anyway.
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

  -- They HAVE moved since the last trail point, so the trail already describes
  -- the journey and the segment proration is honest. Nothing to add.
  if public.fn_haversine_m(v_lat, v_lng, v_slat, v_slng) >= c_min_displacement_m then
    return;
  end if;

  -- The trail point is already effectively at this instant; a second one would
  -- only create a zero-duration segment for the filters to discard.
  if v_at >= now() - interval '5 seconds' then
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

comment on function public.fn_anchor_courier_position(uuid) is
  'Records a zero-distance trail marker at the courier''s current position when '
  'they have not moved since their last trail point, so a route window opening '
  'now starts on a point instead of mid-segment. Trigger-internal.';

create or replace function public.trg_anchor_position_on_accept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_anchor_courier_position(new.assigned_courier_user_id);
  return null;
end;
$$;

revoke execute on function public.trg_anchor_position_on_accept()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_courier_orders_anchor_on_accept on public.courier_orders;

-- AFTER, so accepted_at has already been stamped and the marker lands at the
-- same instant the window opens.
create trigger trg_courier_orders_anchor_on_accept
  after update of status on public.courier_orders
  for each row
  when (
    new.status = 'ACCEPTED'
    and old.status is distinct from new.status
    and new.assigned_courier_user_id is not null
  )
  execute function public.trg_anchor_position_on_accept();
