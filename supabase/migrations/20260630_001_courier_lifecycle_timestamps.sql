-- Courier lifecycle timestamps + revocable offer foundation (fleet marketplace Phase 1 #1).
--
-- Adds per-transition timestamps to courier_orders so downstream telemetry, the
-- SLA engine (P50/P90 dwell times), and the Control Tower can MEASURE the order
-- lifecycle -- none of which is possible today (only created_at/updated_at exist).
--
-- A single BEFORE trigger stamps the matching *_at column on ANY status change,
-- regardless of which path made it (self-pickup route, dashboard actions, the
-- bidi-sync trigger, the pharma mirror, or the revocation cron). This avoids
-- touching every call site and keeps the timestamps authoritative.
--
-- Also adds offer_expires_at + a pg_cron job that reverts EXPIRED offers
-- (status='OFFERED' past expiry) back to CREATED and releases the courier
-- pointer -- the "revocable assignment pointer". Strictly scoped to OFFERED, so
-- ACCEPTED/PICKED_UP/IN_TRANSIT work is NEVER reclaimed. The allocation engine
-- (Phase 1 #2) sets offer_expires_at when it offers; a 120s safety-net default
-- is applied if it does not.
--
-- All additive + idempotent. Nullable columns + null-safe trigger keep existing
-- rows and application code working unchanged.

-- 1. Lifecycle timestamp columns -------------------------------------------------
alter table public.courier_orders
  add column if not exists offered_at       timestamptz,
  add column if not exists accepted_at      timestamptz,
  add column if not exists picked_up_at     timestamptz,
  add column if not exists in_transit_at    timestamptz,
  add column if not exists delivered_at     timestamptz,
  add column if not exists cancelled_at     timestamptz,
  add column if not exists offer_expires_at timestamptz;

comment on column public.courier_orders.offer_expires_at is
  'When the current OFFERED state expires. Set by the allocation engine per-fleet '
  '(offer-with-timeout). If null when status becomes OFFERED, a 120s safety-net '
  'default is applied. revoke_expired_courier_offers() reverts the order to '
  'CREATED past this time.';

-- 2. Stamp lifecycle timestamps on every transition path ------------------------
create or replace function public.stamp_courier_lifecycle_timestamps()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'OFFERED' then
      new.offered_at := coalesce(new.offered_at, now());
      new.offer_expires_at := coalesce(new.offer_expires_at, now() + interval '120 seconds');
    elsif new.status = 'ACCEPTED' then
      new.accepted_at := coalesce(new.accepted_at, now());
    end if;
    return new;
  end if;

  -- UPDATE: only stamp when the status actually changes.
  if new.status is distinct from old.status then
    case new.status
      when 'OFFERED' then
        new.offered_at := coalesce(new.offered_at, now());
        new.offer_expires_at := coalesce(new.offer_expires_at, now() + interval '120 seconds');
      when 'ACCEPTED' then
        new.accepted_at := coalesce(new.accepted_at, now());
        new.offer_expires_at := null;  -- claimed: clear the expiry window
      when 'PICKED_UP' then
        new.picked_up_at := coalesce(new.picked_up_at, now());
      when 'IN_TRANSIT' then
        new.in_transit_at := coalesce(new.in_transit_at, now());
      when 'DELIVERED' then
        new.delivered_at := coalesce(new.delivered_at, now());
      when 'CANCELLED' then
        new.cancelled_at := coalesce(new.cancelled_at, now());
      else
        null;
    end case;
  end if;
  return new;
end;
$$;

comment on function public.stamp_courier_lifecycle_timestamps is
  'Fleet marketplace Phase 1: stamps offered_at/accepted_at/picked_up_at/'
  'in_transit_at/delivered_at/cancelled_at when status transitions to the '
  'matching value, regardless of which code path made the change. Null-safe + '
  'idempotent (coalesce). Clears offer_expires_at on ACCEPTED.';

drop trigger if exists trg_courier_lifecycle_timestamps on public.courier_orders;
create trigger trg_courier_lifecycle_timestamps
  before insert or update on public.courier_orders
  for each row execute function public.stamp_courier_lifecycle_timestamps();

-- 3. Revoke expired offers (revocable assignment pointer) -----------------------
-- Reverts stale OFFERED orders back to the open pool so another courier/fleet
-- can claim them. Strictly status='OFFERED' -- in-progress deliveries are never
-- reclaimed. Reverting to CREATED fires the reverse bidi-sync, which maps
-- 'CREATED' to no restaurant-side change (safe).
create or replace function public.revoke_expired_courier_offers()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  with revoked as (
    update public.courier_orders
       set status = 'CREATED',
           assigned_courier_user_id = null,
           offer_expires_at = null,
           updated_at = now()
     where status = 'OFFERED'
       and offer_expires_at is not null
       and offer_expires_at < now()
    returning id
  )
  select count(*) into v_count from revoked;
  return v_count;
end;
$$;

comment on function public.revoke_expired_courier_offers is
  'Fleet marketplace Phase 1: reverts expired OFFERED courier_orders back to '
  'CREATED + releases the courier pointer. Scoped strictly to OFFERED so '
  'in-progress deliveries are never reclaimed. Runs every minute via pg_cron.';

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'revoke-expired-courier-offers') then
    perform cron.schedule(
      'revoke-expired-courier-offers',
      '* * * * *',  -- every minute (UTC)
      $cron$ select public.revoke_expired_courier_offers(); $cron$
    );
  end if;
end$$;
