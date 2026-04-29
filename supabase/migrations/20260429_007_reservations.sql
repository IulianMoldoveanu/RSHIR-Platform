-- HIR — Table Reservations (closes another GloriaFood gap; they DO have it)
--
-- Owner-side workflow: customer requests a slot via storefront, operator
-- approves/rejects from /dashboard/reservations. No real-time table-grid
-- yet — that's v2. v1 is "request → operator confirms by phone".

-- ============================================================
-- 1. reservation_settings — per-tenant
-- ============================================================
create table if not exists public.reservation_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  is_enabled boolean not null default false,
  -- How far in advance customers can book (default 30 days).
  advance_max_days int not null default 30 check (advance_max_days between 0 and 365),
  -- Minimum lead time before the slot (default 60 minutes).
  advance_min_minutes int not null default 60 check (advance_min_minutes between 0 and 10080),
  -- Reservation slot duration in minutes (default 90).
  slot_duration_min int not null default 90 check (slot_duration_min between 15 and 480),
  -- Maximum party size accepted online (default 12 — bigger requires phone).
  party_size_max int not null default 12 check (party_size_max between 1 and 100),
  -- How many slots can run concurrently per tenant (rough capacity ceiling).
  capacity_per_slot int not null default 4 check (capacity_per_slot between 1 and 1000),
  -- Email notification recipient when a reservation is requested.
  notify_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservation_settings enable row level security;
drop policy if exists reservation_settings_member_read on public.reservation_settings;
create policy reservation_settings_member_read on public.reservation_settings
  for select to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = reservation_settings.tenant_id
         and tm.user_id  = auth.uid()
    )
  );

-- ============================================================
-- 2. reservations
-- ============================================================
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  -- Snapshot — even if customer_id is NULL the operator can still call.
  customer_first_name text not null,
  customer_phone text not null,
  customer_email text,
  party_size int not null check (party_size between 1 and 100),
  requested_at timestamptz not null,
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'NOSHOW', 'COMPLETED')),
  notes text,
  rejection_reason text,
  -- Public token to let the customer cancel/track without a login.
  public_track_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reservations_tenant_status_requested
  on public.reservations (tenant_id, status, requested_at desc);
create index if not exists idx_reservations_requested_at
  on public.reservations (requested_at)
  where status in ('REQUESTED', 'CONFIRMED');

-- updated_at trigger
create or replace function public.fn_reservations_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end$$;

drop trigger if exists trg_reservations_updated_at on public.reservations;
create trigger trg_reservations_updated_at
  before update on public.reservations
  for each row execute function public.fn_reservations_set_updated_at();

alter table public.reservations enable row level security;
drop policy if exists reservations_member_read on public.reservations;
create policy reservations_member_read on public.reservations
  for select to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = reservations.tenant_id
         and tm.user_id  = auth.uid()
    )
  );

-- ============================================================
-- 3. RPC: capacity check + atomic insert
-- ============================================================
-- Public storefront calls this via a PostgREST RPC. It enforces:
--   - reservation system enabled
--   - requested_at within the allowed window (now+min, now+max)
--   - party_size within ceiling
--   - concurrent_slots check (count already-confirmed reservations whose
--     slot overlaps requested_at; reject if >= capacity_per_slot)
create or replace function public.fn_reservation_request(
  p_tenant_id uuid,
  p_first_name text,
  p_phone text,
  p_email text,
  p_party_size int,
  p_requested_at timestamptz,
  p_notes text default null
) returns table (
  reservation_id uuid,
  public_track_token uuid,
  status text,
  message text
) language plpgsql security definer as $$
declare
  v_settings record;
  v_concurrent int;
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

  -- Capacity check: count CONFIRMED + REQUESTED reservations whose slot overlaps.
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

  insert into public.reservations (
    tenant_id, customer_first_name, customer_phone, customer_email,
    party_size, requested_at, notes, status
  ) values (
    p_tenant_id, p_first_name, p_phone, p_email,
    p_party_size, p_requested_at, p_notes, 'REQUESTED'
  ) returning id, public_track_token into v_id, v_token;

  return query select v_id, v_token, 'REQUESTED'::text, 'Rezervarea a fost trimisă. Vă vom confirma în scurt timp.'::text;
end$$;

grant execute on function public.fn_reservation_request(
  uuid, text, text, text, int, timestamptz, text
) to anon, authenticated;

-- Audit log action keys (documented; no schema change):
--   reservation.requested
--   reservation.confirmed
--   reservation.rejected
--   reservation.cancelled
--   reservation.noshow
--   reservation.completed
--   reservation.settings_updated
