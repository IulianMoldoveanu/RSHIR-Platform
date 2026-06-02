-- Migration: courier deletion governance (30-day retention + approval gate)
--
-- Point 5 of the HIR Curier ops roadmap:
--   * Data is RETAINED for 30 days after a deletion request.
--   * The deletion is APPROVED by a platform admin (Iulian) OR by a fleet
--     manager who was explicitly granted permission from the control panel.
--
-- Builds on the existing capture flow (20260629_003 +
-- courier-delete-account-confirm Edge Function): the request row already exists,
-- here we add the approval state machine, the fleet-manager permission, a
-- denormalised fleet_id (set by trigger so the Edge Function needs no change),
-- and a conservative nightly purge that anonymises identifying profile data once
-- the 30-day hold elapses on an APPROVED request.

-- 1. The column the requestAccountDeletion server action already writes --------
alter table public.courier_profiles
  add column if not exists deletion_requested_at timestamptz;

-- 2. Fleet-manager permission (granted by platform admin) ----------------------
alter table public.courier_fleets
  add column if not exists can_approve_deletions boolean not null default false;

comment on column public.courier_fleets.can_approve_deletions is
  'When true, this fleet''s manager (courier_fleets.owner_user_id) may approve/'
  'reject account-deletion requests from their own riders. Toggled by a platform '
  'admin. Platform admins can always approve regardless of this flag.';

-- 3. Approval state machine on the existing request table ----------------------
alter table public.courier_account_deletion_requests
  add column if not exists status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
  add column if not exists fleet_id uuid references public.courier_fleets(id) on delete set null,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists scheduled_purge_at timestamptz;

-- Denormalise the courier's fleet onto the request at insert time so a fleet
-- manager can see/triage their own riders' requests without changing the
-- Edge Function that performs the insert.
create or replace function public.set_deletion_request_fleet()
returns trigger
language plpgsql
as $$
begin
  if new.fleet_id is null then
    select fleet_id into new.fleet_id
      from public.courier_profiles
     where user_id = new.courier_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_deletion_request_fleet on public.courier_account_deletion_requests;
create trigger trg_set_deletion_request_fleet
  before insert on public.courier_account_deletion_requests
  for each row execute function public.set_deletion_request_fleet();

-- The trigger only fires on INSERT, so backfill fleet_id for requests that
-- already existed before this migration (Codex P2) — otherwise they never
-- surface on /fleet/deletions. Idempotent (only touches null fleet_id).
update public.courier_account_deletion_requests r
   set fleet_id = p.fleet_id
  from public.courier_profiles p
 where r.fleet_id is null
   and p.user_id = r.courier_user_id;

create index if not exists idx_courier_deletion_requests_status
  on public.courier_account_deletion_requests (status, requested_at desc);
create index if not exists idx_courier_deletion_requests_fleet
  on public.courier_account_deletion_requests (fleet_id, requested_at desc);
-- Drives the purge job: APPROVED requests whose hold has elapsed.
create index if not exists idx_courier_deletion_requests_purge
  on public.courier_account_deletion_requests (scheduled_purge_at)
  where status = 'APPROVED' and completed_at is null;

-- 4. RLS: fleet manager (own fleet) + platform admin can read requests ---------
-- (The 20260629_003 migration already granted the courier read of their own row.)
drop policy if exists "courier_deletion_requests_fleet_read" on public.courier_account_deletion_requests;
create policy "courier_deletion_requests_fleet_read"
  on public.courier_account_deletion_requests for select
  using (
    exists (
      select 1 from public.courier_fleets f
      where f.id = courier_account_deletion_requests.fleet_id
        and f.owner_user_id = auth.uid()
    )
  );

drop policy if exists "courier_deletion_requests_admin_read" on public.courier_account_deletion_requests;
create policy "courier_deletion_requests_admin_read"
  on public.courier_account_deletion_requests for select
  using (
    exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- Decisions are applied by a service-role server action (decideDeletionAction)
-- which authorises platform-admin OR the permissioned owning fleet manager in
-- code, so no UPDATE policy is granted here.

-- 5. Nightly purge — runs the actual erasure once the 30-day hold elapses ------
-- Conservative by design: anonymises identifying PROFILE data (name, phone,
-- avatar) and closes the request. Earnings/order history are retained for the
-- legal fiscal window; final auth-user removal is handled out of band by an
-- admin/service step (auth.admin.deleteUser), not from SQL.
create or replace function public.purge_due_courier_deletions()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  with due as (
    select id, courier_user_id
      from public.courier_account_deletion_requests
     where status = 'APPROVED'
       and completed_at is null
       and scheduled_purge_at is not null
       and scheduled_purge_at <= now()
  ),
  anon as (
    update public.courier_profiles p
       set full_name = 'Cont șters',
           phone = '',          -- courier_profiles.phone is NOT NULL; '' = erased
           avatar_url = null,
           status = 'SUSPENDED'
      from due
     where p.user_id = due.courier_user_id
    returning p.user_id
  ),
  done as (
    update public.courier_account_deletion_requests r
       set status = 'COMPLETED',
           completed_at = now()
      from due
     where r.id = due.id
    returning r.id
  )
  select count(*) into v_count from done;
  return v_count;
end;
$$;

comment on function public.purge_due_courier_deletions is
  'Anonymises profile PII + closes APPROVED courier deletion requests whose '
  '30-day retention has elapsed. Idempotent. Final auth-user deletion is a '
  'separate admin/service step.';

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'courier-deletion-purge-daily') then
    perform cron.schedule(
      'courier-deletion-purge-daily',
      '40 2 * * *',  -- 02:40 UTC daily
      $cron$ select public.purge_due_courier_deletions(); $cron$
    );
  end if;
end$$;
