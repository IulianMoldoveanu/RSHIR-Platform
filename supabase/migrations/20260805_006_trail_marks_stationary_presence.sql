-- Codex review (PR #1055, P2, round 10): the edge bound from 20260805_005
-- discards a valid start position after a stationary wait.
--
-- THE COLLISION
--   The heartbeat refreshes courier_shifts every two minutes while a courier
--   stands still, but record_courier_ping deliberately does NOT append a trail
--   point under 15 m of displacement. So a courier parked outside a restaurant
--   for fifteen minutes has a perfectly fresh presence and a trail whose last
--   point is fifteen minutes old — their true position, since they have not
--   moved. The five-minute edge bound then throws it away, leaving the first
--   movement after accept with no predecessor: the opening segment vanishes, or
--   a short order becomes unmeasured outright.
--
-- THE ROOT CAUSE
--   A gap in the trail meant two different things — "stationary" and "not
--   reporting" — and the edge bound has to tell them apart. It cannot, because
--   nothing recorded the difference.
--
-- THE FIX
--   Make the trail say it. When a fix is suppressed for being under the
--   displacement threshold and the trail has been silent for three minutes,
--   record a marker anyway — carrying the PREVIOUS stored coordinates, not the
--   new ones. The segment it forms is exactly zero metres long, so the
--   anti-jitter guarantee is untouched: a phone drifting on a counter still
--   cannot invent distance. What it does add is evidence that the courier was
--   present and reporting at that moment.
--
--   With that, a gap in the trail means only one thing — nobody was reporting —
--   which is precisely what the edge bound assumes.
--
--   Cost: one row per stationary courier per three minutes. An idle eight-hour
--   shift adds ~160 rows carrying zero distance, purged with the rest at 30
--   days.

create or replace function public.record_courier_ping(
  p_courier_user_id uuid,
  p_lat             numeric,
  p_lng             numeric,
  p_accuracy_m      numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Below this, we assume the courier stood still and the delta is jitter.
  c_min_displacement_m constant double precision := 15;
  -- A fix this vague places the courier anywhere inside a city block.
  c_max_accuracy_m     constant double precision := 100;
  -- How long the trail may stay silent before a stationary courier records a
  -- zero-distance marker. Must stay well under the route edge bound, so a
  -- genuine standstill never looks like an absence.
  c_trail_keepalive    constant interval := interval '3 minutes';

  v_shift_started_at timestamptz;
  v_last_lat         numeric;
  v_last_lng         numeric;
  v_last_at          timestamptz;
begin
  if p_courier_user_id is null then
    return;
  end if;

  if p_lat is null or p_lng is null then return; end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then return; end if;
  if p_lat = 0 and p_lng = 0 then return; end if;

  select cs.started_at
    into v_shift_started_at
    from public.courier_shifts cs
   where cs.courier_user_id = p_courier_user_id
     and cs.status = 'ONLINE'
   order by cs.started_at desc
   limit 1;

  if v_shift_started_at is null then
    return;
  end if;

  -- (a) Presence — liberal, unconditional. Dispatch depends on it.
  update public.courier_shifts
     set last_lat     = p_lat,
         last_lng     = p_lng,
         last_seen_at = now()
   where courier_user_id = p_courier_user_id
     and status = 'ONLINE';

  -- (b) Trail — strict.
  if p_accuracy_m is not null and p_accuracy_m > c_max_accuracy_m then
    return;
  end if;

  select clp.lat, clp.lng, clp.recorded_at
    into v_last_lat, v_last_lng, v_last_at
    from public.courier_location_pings clp
   where clp.courier_user_id = p_courier_user_id
     and clp.recorded_at >= v_shift_started_at
   order by clp.recorded_at desc
   limit 1;

  if v_last_lat is not null
     and public.fn_haversine_m(v_last_lat, v_last_lng, p_lat, p_lng) < c_min_displacement_m
  then
    -- Standing still. Leave a marker if the trail has been quiet long enough
    -- that the silence would otherwise read as "not reporting" — carrying the
    -- PREVIOUS coordinates, so the segment it creates is exactly zero metres.
    if v_last_at < now() - c_trail_keepalive then
      insert into public.courier_location_pings (courier_user_id, lat, lng, accuracy_m)
      values (p_courier_user_id, v_last_lat, v_last_lng, p_accuracy_m);
    end if;
    return;
  end if;

  insert into public.courier_location_pings (courier_user_id, lat, lng, accuracy_m)
  values (p_courier_user_id, p_lat, p_lng, p_accuracy_m);
end;
$$;

revoke execute on function public.record_courier_ping(uuid, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.record_courier_ping(uuid, numeric, numeric, numeric)
  to service_role;

comment on function public.record_courier_ping(uuid, numeric, numeric, numeric) is
  'Single writer for courier position. Always refreshes courier_shifts.last_* '
  'for the ONLINE shift (dispatch freshness). Appends to '
  'courier_location_pings when the fix is accurate (<=100m) and at least 15m '
  'from the previous stored point; when it is not, still records a '
  'zero-distance marker at the previous coordinates if the trail has been '
  'silent for 3 minutes, so a standstill is distinguishable from an absence. '
  'No-op when the courier has no ONLINE shift. service_role only.';
