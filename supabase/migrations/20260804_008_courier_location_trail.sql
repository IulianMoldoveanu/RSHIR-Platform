-- HIR Courier — GPS trail capture (the missing distance source).
--
-- WHY
--   courier_shifts only ever holds the LATEST position: last_lat/last_lng/
--   last_seen_at are overwritten on every fix. Nothing in the system has
--   ever been able to answer "how far did this courier actually drive for
--   this order". Meanwhile fleet_courier_tariffs.per_km_cents (20260615_006)
--   already documents `payout = pickup_fee + per_km * distance_km` — a
--   formula with no distance input. This migration adds that input.
--
-- TWO PATHS, DELIBERATELY DIFFERENT STRICTNESS
--   Presence (courier_shifts.last_*) stays LIBERAL: every fix is written,
--   whatever its accuracy or displacement. fn_auto_dispatch_sweep refuses
--   couriers whose last_seen_at is older than 5 minutes (20260804_007), so
--   a stricter presence rule would silently stop couriers getting offers.
--
--   The trail is STRICT: a point is stored only when the courier has really
--   MOVED (>= MIN_DISPLACEMENT_M from the last stored point) and the fix is
--   accurate enough (<= MAX_ACCURACY_M). A phone sitting on a restaurant
--   counter drifts hundreds of metres an hour on GPS jitter alone; storing
--   every fix would invent kilometres that were never driven, and this
--   number is destined to feed payouts.
--
-- RETENTION
--   30 days, mirroring the DPA policy 20260611_001 applies to the
--   courier_shifts GPS columns. That cron NULLs three columns on OFFLINE
--   shifts and cannot cover a new table — this migration ships its own.
--   The DERIVED per-order aggregates (20260804_009) intentionally survive
--   the purge: a total in metres is an operational measurement, not
--   personal location data.
--
-- ACCURACY, HONESTLY
--   Summing straight lines between sparse samples UNDER-estimates real road
--   distance (chords cut corners). At a 30s sampling interval in city
--   traffic the error is a few percent, and it errs low — never inflating
--   what a courier is owed.

-- ---------------------------------------------------------------------------
-- 1. Shared haversine helper.
--    Inlined by hand in fn_auto_dispatch_sweep and delivery pricing today;
--    the trail needs it in two more places (ingest filter + aggregation), so
--    it earns a name. IMMUTABLE + STRICT so the planner can fold it.
-- ---------------------------------------------------------------------------
create or replace function public.fn_haversine_m(
  p_lat1 numeric, p_lng1 numeric,
  p_lat2 numeric, p_lng2 numeric
)
returns double precision
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select 6371000.0 * 2 * asin(least(1.0, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )));
$$;

comment on function public.fn_haversine_m(numeric, numeric, numeric, numeric) is
  'Great-circle distance in metres between two WGS84 points. least(1.0, ...) '
  'guards the asin domain against floating-point overshoot on identical points.';

-- ---------------------------------------------------------------------------
-- 2. The trail itself.
-- ---------------------------------------------------------------------------
create table if not exists public.courier_location_pings (
  id              bigint generated always as identity primary key,
  courier_user_id uuid        not null references auth.users(id) on delete cascade,
  lat             numeric(9,6) not null,
  lng             numeric(9,6) not null,
  accuracy_m      numeric(7,1),
  recorded_at     timestamptz not null default now()
);

comment on table public.courier_location_pings is
  'Append-only, deliberately sparse GPS trail for couriers on shift. Written '
  'only via record_courier_ping() (service_role), which drops fixes that are '
  'inaccurate or too close to the previous point. Purged after 30 days by the '
  'courier-location-trail-30day-purge cron; the per-order aggregates derived '
  'from it on courier_orders survive that purge.';

comment on column public.courier_location_pings.accuracy_m is
  'Reported horizontal accuracy radius in metres, as given by the device. '
  'NULL when the platform did not report one.';

-- Aggregation always scans one courier over one time window; the purge always
-- scans by time alone. Two access patterns, two indexes — the BRIN costs a
-- few kilobytes because the table is append-ordered by recorded_at.
create index if not exists idx_courier_location_pings_courier_time
  on public.courier_location_pings (courier_user_id, recorded_at);

create index if not exists idx_courier_location_pings_recorded_brin
  on public.courier_location_pings using brin (recorded_at);

-- Fail closed: no client ever reads or writes this table directly. Reads go
-- through the SECURITY DEFINER aggregates, writes through record_courier_ping.
alter table public.courier_location_pings enable row level security;
revoke all on public.courier_location_pings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ingest.
--    Replaces the bare courier_shifts UPDATE the server action used to do,
--    so presence + trail stay in ONE round trip and cannot disagree.
-- ---------------------------------------------------------------------------
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

  v_shift_started_at timestamptz;
  v_last_lat  numeric;
  v_last_lng  numeric;
begin
  if p_courier_user_id is null then
    return;
  end if;

  -- Defence in depth: the server action validates too, but this function is
  -- the only writer and must not be able to poison the trail.
  if p_lat is null or p_lng is null then return; end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then return; end if;
  -- Null Island: passes the bounds check but is virtually always the
  -- artefact of a failed fix.
  if p_lat = 0 and p_lng = 0 then return; end if;

  -- No ONLINE shift means the courier is not working: never record a
  -- position. Same rule the previous UPDATE enforced via its WHERE clause.
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

  select clp.lat, clp.lng
    into v_last_lat, v_last_lng
    from public.courier_location_pings clp
   where clp.courier_user_id = p_courier_user_id
     and clp.recorded_at >= v_shift_started_at
   order by clp.recorded_at desc
   limit 1;

  if v_last_lat is not null
     and public.fn_haversine_m(v_last_lat, v_last_lng, p_lat, p_lng) < c_min_displacement_m
  then
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
  'for the ONLINE shift (dispatch freshness); appends to '
  'courier_location_pings only when the fix is accurate (<=100m) and at least '
  '15m from the previous stored point. No-op when the courier has no ONLINE '
  'shift. service_role only.';

-- ---------------------------------------------------------------------------
-- 4. DPA retention — the trail's own 30-day purge.
--    Idempotent: unscheduled by name before being re-created.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
    from cron.job
   where jobname = 'courier-location-trail-30day-purge';

  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- 02:35 UTC — five minutes after courier-gps-dpa-30day-purge (02:30) so the
-- two location purges never contend.
select cron.schedule(
  'courier-location-trail-30day-purge',
  '35 2 * * *',
  $$
    delete from public.courier_location_pings
     where recorded_at < now() - interval '30 days';
  $$
);
