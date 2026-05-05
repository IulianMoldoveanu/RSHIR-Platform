-- Lane Y3 — Reservation table-plan picker
--
-- Adds an optional, opt-in floor plan to /rezervari. When the operator turns
-- it on, customers pick a specific table from a drag-and-drop layout the
-- operator built in the dashboard. When off, the existing request form stays
-- unchanged — additive, zero regression.
--
-- Schema shape:
--   reservation_settings.table_plan                   jsonb (tables: [{id,x,y,w,h,seats,label,shape}])
--   reservation_settings.show_table_plan_to_customers bool  (default false)
--   reservations.table_id                             text  (nullable; nested-id from plan, no FK)
--
-- The plan is stored denormalised in jsonb because:
--   - tables aren't independently queried — they live + die with the tenant settings
--   - the picker reads the whole plan in one shot
--   - operators rebuild the plan ad-hoc and IDs only need to be stable within the tenant
--
-- A separate `tables` table would have been over-engineering for v1.

-- ============================================================
-- 1. reservation_settings: plan + visibility toggle
-- ============================================================
alter table public.reservation_settings
  add column if not exists table_plan jsonb not null default '{"tables":[]}'::jsonb;

alter table public.reservation_settings
  add column if not exists show_table_plan_to_customers boolean not null default false;

-- ============================================================
-- 2. reservations.table_id (nullable; null means "any table / phone-pick")
-- ============================================================
alter table public.reservations
  add column if not exists table_id text;

-- Conflict-detection index: (tenant_id, table_id, requested_at) lets the
-- storefront cheaply find which tables are already booked for an overlapping
-- slot. We only index rows that have a table_id assigned.
create index if not exists idx_reservations_tenant_table_requested_at
  on public.reservations (tenant_id, table_id, requested_at)
  where table_id is not null
    and status in ('REQUESTED', 'CONFIRMED');

-- ============================================================
-- 3. fn_reservation_request: accept p_table_id, enforce per-table overlap
-- ============================================================
-- Replace the v1 RPC with a v2 that takes an optional table_id. The v1
-- signature stays compatible — old callers (storefront with plan disabled)
-- still pass NULL and get the original behaviour.
create or replace function public.fn_reservation_request(
  p_tenant_id uuid,
  p_first_name text,
  p_phone text,
  p_email text,
  p_party_size int,
  p_requested_at timestamptz,
  p_notes text default null,
  p_table_id text default null
) returns table (
  reservation_id uuid,
  public_track_token uuid,
  status text,
  message text
) language plpgsql security definer as $$
declare
  v_settings record;
  v_concurrent int;
  v_table_taken int;
  v_table jsonb;
  v_table_seats int;
  v_id uuid;
  v_token uuid;
begin
  select * into v_settings from public.reservation_settings where tenant_id = p_tenant_id;
  if v_settings is null or not v_settings.is_enabled then
    return query select null::uuid, null::uuid, 'REJECTED'::text, 'Rezervările sunt dezactivate.'::text;
    return;
  end if;

  if p_party_size < 1 or p_party_size > v_settings.party_size_max then
    return query select null::uuid, null::uuid, 'REJECTED'::text,
      ('Pentru un grup mai mare de ' || v_settings.party_size_max || ' vă rugăm să sunați direct.')::text;
    return;
  end if;

  if p_requested_at < now() + (v_settings.advance_min_minutes || ' minutes')::interval then
    return query select null::uuid, null::uuid, 'REJECTED'::text,
      ('Cu mai puțin de ' || v_settings.advance_min_minutes || ' minute în avans nu putem confirma online.')::text;
    return;
  end if;

  if p_requested_at > now() + (v_settings.advance_max_days || ' days')::interval then
    return query select null::uuid, null::uuid, 'REJECTED'::text,
      ('Putem accepta rezervări cu maximum ' || v_settings.advance_max_days || ' zile în avans.')::text;
    return;
  end if;

  -- If a specific table was picked, validate it against the plan and
  -- block overlapping reservations on the same table.
  if p_table_id is not null then
    -- Find the table row in the jsonb plan.
    select t into v_table
      from jsonb_array_elements(coalesce(v_settings.table_plan->'tables', '[]'::jsonb)) as t
     where t->>'id' = p_table_id
     limit 1;

    if v_table is null then
      return query select null::uuid, null::uuid, 'REJECTED'::text,
        'Masa selectată nu mai există.'::text;
      return;
    end if;

    v_table_seats := coalesce((v_table->>'seats')::int, 0);
    if v_table_seats > 0 and p_party_size > v_table_seats then
      return query select null::uuid, null::uuid, 'REJECTED'::text,
        ('Masa selectată are ' || v_table_seats || ' locuri, prea puține pentru ' || p_party_size || ' persoane.')::text;
      return;
    end if;

    -- Per-table overlap check: any REQUESTED/CONFIRMED reservation on the
    -- same table with overlapping slot windows.
    select count(*)::int into v_table_taken
      from public.reservations r
     where r.tenant_id = p_tenant_id
       and r.table_id = p_table_id
       and r.status in ('REQUESTED', 'CONFIRMED')
       and r.requested_at > p_requested_at - (v_settings.slot_duration_min || ' minutes')::interval
       and r.requested_at < p_requested_at + (v_settings.slot_duration_min || ' minutes')::interval;

    if v_table_taken > 0 then
      return query select null::uuid, null::uuid, 'REJECTED'::text,
        'Masa este deja rezervată în acest interval. Vă rugăm alegeți altă masă.'::text;
      return;
    end if;
  else
    -- No specific table: keep the legacy global capacity ceiling.
    select count(*)::int into v_concurrent
      from public.reservations r
     where r.tenant_id = p_tenant_id
       and r.status in ('REQUESTED', 'CONFIRMED')
       and r.requested_at > p_requested_at - (v_settings.slot_duration_min || ' minutes')::interval
       and r.requested_at < p_requested_at + (v_settings.slot_duration_min || ' minutes')::interval;

    if v_concurrent >= v_settings.capacity_per_slot then
      return query select null::uuid, null::uuid, 'REJECTED'::text,
        'Slot rezervat. Vă rugăm încercați alt interval.'::text;
      return;
    end if;
  end if;

  insert into public.reservations (
    tenant_id, customer_first_name, customer_phone, customer_email,
    party_size, requested_at, notes, status, table_id
  ) values (
    p_tenant_id, p_first_name, p_phone, p_email,
    p_party_size, p_requested_at, p_notes, 'REQUESTED', p_table_id
  ) returning id, public_track_token into v_id, v_token;

  return query select v_id, v_token, 'REQUESTED'::text, 'Rezervarea a fost trimisă. Vă vom confirma în scurt timp.'::text;
end$$;

grant execute on function public.fn_reservation_request(
  uuid, text, text, text, int, timestamptz, text, text
) to anon, authenticated;

-- Drop the old 7-arg signature; the new 8-arg one fully supersedes it.
-- Cast the dropped signature explicitly so PG picks the right overload.
drop function if exists public.fn_reservation_request(
  uuid, text, text, text, int, timestamptz, text
);

-- ============================================================
-- 4. fn_reserved_table_ids — storefront availability lookup
-- ============================================================
-- Returns the list of table_ids that already have an overlapping
-- REQUESTED/CONFIRMED reservation, given a candidate slot. The picker
-- uses this to grey out unavailable tables before submission.
create or replace function public.fn_reserved_table_ids(
  p_tenant_id uuid,
  p_requested_at timestamptz
) returns table (table_id text)
language plpgsql stable security definer as $$
declare
  v_slot_min int;
begin
  select coalesce(slot_duration_min, 90) into v_slot_min
    from public.reservation_settings
   where tenant_id = p_tenant_id;

  if v_slot_min is null then
    v_slot_min := 90;
  end if;

  return query
    select distinct r.table_id
      from public.reservations r
     where r.tenant_id = p_tenant_id
       and r.table_id is not null
       and r.status in ('REQUESTED', 'CONFIRMED')
       and r.requested_at > p_requested_at - (v_slot_min || ' minutes')::interval
       and r.requested_at < p_requested_at + (v_slot_min || ' minutes')::interval;
end$$;

grant execute on function public.fn_reserved_table_ids(uuid, timestamptz) to anon, authenticated;
