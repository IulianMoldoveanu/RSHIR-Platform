-- Courier Shift Availability Slots
--
-- Couriers declare future availability windows (e.g. Mon 18-22).
-- Default status is REQUESTED — treated as valid for dispatch from creation.
-- Modifications to ACTIVE slots create a new REQUESTED_CHANGE row with
-- prev_slot_id set; the old row stays ACTIVE until Iulian approves/rejects.
-- Hard deletes are forbidden — use status='CANCELLED' to preserve audit trail.
--
-- State machine:
--   REQUESTED → ACTIVE (auto / no admin action needed at creation)
--   ACTIVE → REQUESTED_CHANGE (new row inserted; old stays ACTIVE)
--   REQUESTED_CHANGE → ACTIVE (new) + SUPERSEDED (old)   [approve]
--              or     → REJECTED (new); old stays ACTIVE  [reject]
--   Any non-terminal → CANCELLED                          [courier cancels]

-- Required for EXCLUDE USING gist on range columns.
-- Safe to call if already enabled.
create extension if not exists btree_gist;

-- ============================================================
-- TABLE
-- ============================================================
create table if not exists public.courier_shift_slots (
  id               uuid        primary key default gen_random_uuid(),
  courier_user_id  uuid        not null references auth.users(id) on delete cascade,
  slot_start       timestamptz not null,
  slot_end         timestamptz not null,
  status           text        not null default 'REQUESTED'
                               check (status in (
                                 'REQUESTED',
                                 'ACTIVE',
                                 'REQUESTED_CHANGE',
                                 'SUPERSEDED',
                                 'REJECTED',
                                 'CANCELLED'
                               )),
  -- Links a modification request back to the slot it would replace.
  prev_slot_id     uuid        references public.courier_shift_slots(id) on delete set null,
  -- Admin review metadata (NULL until a human acts on a REQUESTED_CHANGE).
  reviewed_by      uuid        references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  review_reason    text,
  -- Optional free-text from the courier when creating / modifying a slot.
  courier_note     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint slot_dates_valid check (slot_end > slot_start)
);

-- ============================================================
-- OVERLAP PREVENTION — EXCLUDE USING gist
--
-- Chosen over a trigger because EXCLUDE is enforced atomically by the
-- engine, survives concurrent inserts, and requires zero maintenance code.
-- The partial predicate limits the constraint to live slots only;
-- SUPERSEDED / REJECTED / CANCELLED rows may overlap freely (historical).
-- '[)' = inclusive start, exclusive end — standard for time ranges.
-- ============================================================
alter table public.courier_shift_slots
  add constraint no_active_slot_overlap
  exclude using gist (
    courier_user_id with =,
    tstzrange(slot_start, slot_end, '[)') with &&
  )
  where (status in ('ACTIVE', 'REQUESTED'));

-- ============================================================
-- INDEXES
-- ============================================================
-- Courier's own slot list, newest first.
create index if not exists idx_css_courier_start
  on public.courier_shift_slots (courier_user_id, slot_start desc);

-- Admin weekly view: "what's coming up this week?"
create index if not exists idx_css_status_start
  on public.courier_shift_slots (status, slot_start);

-- Dispatch lookup: "who is available right now?"
create index if not exists idx_css_active_range
  on public.courier_shift_slots (slot_start, slot_end)
  where status = 'ACTIVE';

-- ============================================================
-- LINK courier_shifts → the slot that authorised the shift session
-- ============================================================
alter table public.courier_shifts
  add column if not exists approved_slot_id uuid
    references public.courier_shift_slots(id) on delete set null;

-- ============================================================
-- updated_at TRIGGER
-- ============================================================
create or replace function public.courier_shift_slots_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_css_updated_at on public.courier_shift_slots;
create trigger trg_css_updated_at
  before update on public.courier_shift_slots
  for each row execute function public.courier_shift_slots_set_updated_at();

-- ============================================================
-- RPC: request_slot_change(slot_id, new_start, new_end, reason)
--
-- Called by the courier to modify an ACTIVE slot.
-- Inserts a REQUESTED_CHANGE row pointing back to the original.
-- Does NOT touch the existing ACTIVE row — admin must approve.
-- Returns the new row's id.
-- ============================================================
create or replace function public.request_slot_change(
  p_slot_id   uuid,
  p_new_start timestamptz,
  p_new_end   timestamptz,
  p_reason    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot       public.courier_shift_slots;
  v_new_id     uuid;
begin
  -- Verify the slot exists, belongs to the caller, and is ACTIVE.
  select * into v_slot
    from public.courier_shift_slots
   where id = p_slot_id
     and courier_user_id = auth.uid()
     and status = 'ACTIVE';

  if not found then
    raise exception 'Slot not found, not yours, or not ACTIVE (id=%)', p_slot_id;
  end if;

  if p_new_end <= p_new_start then
    raise exception 'slot_end must be after slot_start';
  end if;

  insert into public.courier_shift_slots (
    courier_user_id,
    slot_start,
    slot_end,
    status,
    prev_slot_id,
    courier_note
  ) values (
    auth.uid(),
    p_new_start,
    p_new_end,
    'REQUESTED_CHANGE',
    p_slot_id,
    p_reason
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ============================================================
-- RPC: approve_slot_change(change_slot_id)
--
-- Admin-only. Sets the REQUESTED_CHANGE row to ACTIVE,
-- the previous slot to SUPERSEDED, and records who approved.
-- ============================================================
create or replace function public.approve_slot_change(
  p_change_slot_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change public.courier_shift_slots;
begin
  -- Caller must be a platform admin.
  if not exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  ) then
    raise exception 'Forbidden: platform admin required';
  end if;

  select * into v_change
    from public.courier_shift_slots
   where id = p_change_slot_id
     and status = 'REQUESTED_CHANGE';

  if not found then
    raise exception 'Slot not found or not in REQUESTED_CHANGE status (id=%)', p_change_slot_id;
  end if;

  -- Supersede the old slot.
  if v_change.prev_slot_id is not null then
    update public.courier_shift_slots
       set status = 'SUPERSEDED',
           reviewed_by  = auth.uid(),
           reviewed_at  = now()
     where id = v_change.prev_slot_id;
  end if;

  -- Activate the new slot.
  update public.courier_shift_slots
     set status      = 'ACTIVE',
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_change_slot_id;
end;
$$;

-- ============================================================
-- RPC: reject_slot_change(change_slot_id, reason)
--
-- Admin-only. Marks the REQUESTED_CHANGE as REJECTED.
-- The previous ACTIVE slot is untouched (courier keeps their original slot).
-- ============================================================
create or replace function public.reject_slot_change(
  p_change_slot_id uuid,
  p_reason         text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  ) then
    raise exception 'Forbidden: platform admin required';
  end if;

  update public.courier_shift_slots
     set status        = 'REJECTED',
         reviewed_by   = auth.uid(),
         reviewed_at   = now(),
         review_reason = p_reason
   where id = p_change_slot_id
     and status = 'REQUESTED_CHANGE';

  if not found then
    raise exception 'Slot not found or not in REQUESTED_CHANGE status (id=%)', p_change_slot_id;
  end if;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.courier_shift_slots enable row level security;

-- Courier: read own slots.
drop policy if exists "css_courier_select" on public.courier_shift_slots;
create policy "css_courier_select"
  on public.courier_shift_slots for select
  to authenticated
  using (courier_user_id = auth.uid());

-- Courier: insert new slots (REQUESTED or REQUESTED_CHANGE only — status enforced by check constraint).
drop policy if exists "css_courier_insert" on public.courier_shift_slots;
create policy "css_courier_insert"
  on public.courier_shift_slots for insert
  to authenticated
  with check (
    courier_user_id = auth.uid()
    and status in ('REQUESTED', 'REQUESTED_CHANGE')
  );

-- Courier: cancel own non-terminal slots (status → CANCELLED only).
-- Transitions to ACTIVE/SUPERSEDED/REJECTED go through admin RPCs (security definer).
drop policy if exists "css_courier_update" on public.courier_shift_slots;
create policy "css_courier_update"
  on public.courier_shift_slots for update
  to authenticated
  using (courier_user_id = auth.uid())
  with check (
    courier_user_id = auth.uid()
    and status = 'CANCELLED'
  );

-- Platform admin: read all slots.
drop policy if exists "css_admin_select" on public.courier_shift_slots;
create policy "css_admin_select"
  on public.courier_shift_slots for select
  to authenticated
  using (
    exists (select 1 from public.platform_admins where user_id = auth.uid())
  );

-- DELETE: no policy created → hard deletes blocked for all authenticated roles.
-- Service-role bypasses RLS but should never delete (use CANCELLED).
