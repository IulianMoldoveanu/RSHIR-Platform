-- Immutable platform order-event log + canonical_order_id (fleet marketplace Phase 2).
--
-- WHY: today there is no single source of truth for "what happened to an order"
-- across the two verticals. courier_orders is a mutable PROJECTION (the current
-- state), so you cannot reconstruct history, and counting count(courier_orders)
-- double-counts a pharma order (it exists as a Delivery in HIR-PHARMA AND as a
-- mirrored courier_orders row). There is also no measurable North Star.
--
-- This adds an APPEND-ONLY event log. Every courier_orders creation + status
-- transition appends one row. The same physical order gets the SAME
-- canonical_order_id from every system (sha256 of source_system:native_id), so
-- analytics count distinct canonical_order_id and never double-count. When the
-- pharma side later emits its own events with source='pharma' + the pharma
-- order id (which the mirror stores in external_ref), they collapse onto the
-- same canonical id.
--
-- PRIVACY: the log is operational/statistical data, never special-category.
-- It stores pseudonymous ids + status + economics + a COARSENED dropoff
-- coordinate (rounded to ~1km for zone-density only) -- never phone, name,
-- street address, or medication. That is what makes append-only + immutable
-- safe to keep (no art. 9 / no precise home address in the log).
--
-- All additive. RLS default-deny (platform-internal; couriers/tenants cannot
-- read the cross-vendor log -- reads go through service_role / admin client).

-- 1. The append-only event log -------------------------------------------------
create table if not exists public.platform_order_events (
  event_id           uuid primary key default gen_random_uuid(),
  canonical_order_id text        not null,
  source_system      text        not null,            -- 'restaurant' | 'pharma'
  vertical           text,
  native_order_id    text,                            -- the source system's own id (debug/join)
  courier_order_id   uuid,                            -- the projection row this event came from
  event_type         text        not null,            -- 'order.created' | 'status.OFFERED' | ...
  status             text,                            -- courier_orders.status at event time
  actor_role         text        not null default 'system',
  reason_code        text,                            -- reserved: allocation-engine reasonCodes[]
  fleet_id           uuid,
  courier_user_id    uuid,
  zone_id            uuid,                             -- reserved: populated once zone resolution exists
  occurred_at        timestamptz not null,            -- when it happened (business time)
  recorded_at        timestamptz not null default now(), -- when we wrote it (ingest time)
  payload            jsonb       not null default '{}'::jsonb
);

comment on table public.platform_order_events is
  'Fleet marketplace Phase 2: append-only (immutable) cross-vertical order event '
  'log. Source of truth for history + analytics. count(distinct canonical_order_id) '
  'is the de-dup key. No special-category / direct PII -- pseudonymous ids, status, '
  'economics, and a coarsened (~1km) dropoff coordinate only.';

create index if not exists idx_poe_canonical       on public.platform_order_events (canonical_order_id);
create index if not exists idx_poe_occurred         on public.platform_order_events (occurred_at);
create index if not exists idx_poe_source_vertical  on public.platform_order_events (source_system, vertical);
create index if not exists idx_poe_event_type       on public.platform_order_events (event_type);
create index if not exists idx_poe_courier_order    on public.platform_order_events (courier_order_id);

-- 2. Immutability: append-only -------------------------------------------------
-- Recorded facts never change. UPDATE/DELETE on rows are blocked. (DDL/ALTER is
-- unaffected; only row DML fires this.) Because the log holds no direct PII,
-- GDPR erasure does not require deleting rows here.
create or replace function public.platform_order_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform_order_events is append-only (% blocked)', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists trg_platform_order_events_immutable on public.platform_order_events;
create trigger trg_platform_order_events_immutable
  before update or delete on public.platform_order_events
  for each row execute function public.platform_order_events_immutable();

-- 3. RLS: default-deny ---------------------------------------------------------
alter table public.platform_order_events enable row level security;
-- No anon/authenticated policies on purpose: this cross-vendor log must not be
-- readable by couriers or tenants. service_role bypasses RLS for platform
-- analytics + the SECURITY DEFINER capture function below.

-- 4. Capture trigger on courier_orders -----------------------------------------
-- AFTER trigger so it sees the finalized row (incl. the lifecycle *_at stamps
-- from 20260630_001). SECURITY DEFINER so it can insert into the locked-down log
-- regardless of which role made the courier_orders write. WRAPPED so a logging
-- failure NEVER aborts the dispatch write -- the log is best-effort telemetry,
-- not a gate on operations.
create or replace function public.capture_courier_order_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_source     text;
  v_native     text;
  v_canonical  text;
  v_event_type text;
  v_occurred   timestamptz;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'order.created';
    v_occurred   := coalesce(new.created_at, now());
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_event_type := 'status.' || new.status;
    v_occurred   := now();
  else
    return new;  -- non-status update: nothing to log
  end if;

  begin
    v_source := coalesce(nullif(new.vertical, ''), 'rshir');
    v_native := coalesce(
      nullif(new.source_order_id, ''),
      nullif(new.external_ref, ''),
      new.restaurant_order_id::text,
      new.id::text
    );
    v_canonical := encode(extensions.digest(v_source || ':' || v_native, 'sha256'), 'hex');

    insert into public.platform_order_events (
      canonical_order_id, source_system, vertical, native_order_id,
      courier_order_id, event_type, status, actor_role, fleet_id,
      courier_user_id, occurred_at, payload
    ) values (
      v_canonical, v_source, new.vertical, v_native,
      new.id, v_event_type, new.status, 'system', new.fleet_id,
      new.assigned_courier_user_id, v_occurred,
      jsonb_build_object(
        -- coarsened to ~1km grid: zone-density signal, NOT a home address
        'dropoff_lat_1km', round(new.dropoff_lat, 2),
        'dropoff_lng_1km', round(new.dropoff_lng, 2),
        'total_ron',        new.total_ron,
        'delivery_fee_ron', new.delivery_fee_ron,
        'payment_method',   new.payment_method
      )
    );
  exception when others then
    raise warning 'capture_courier_order_event failed for courier_order %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

comment on function public.capture_courier_order_event is
  'Fleet marketplace Phase 2: appends an immutable platform_order_events row on '
  'courier_orders create + every status transition. Derives canonical_order_id = '
  'sha256(vertical:native_id) so analytics de-dup across systems. Wrapped: a '
  'logging failure never aborts the dispatch write.';

drop trigger if exists trg_capture_courier_order_event on public.courier_orders;
create trigger trg_capture_courier_order_event
  after insert or update on public.courier_orders
  for each row execute function public.capture_courier_order_event();
