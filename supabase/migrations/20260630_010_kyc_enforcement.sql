-- Per-fleet KYC enforcement (fleet marketplace Phase 3).
--
-- Turns the KYC foundation (20260630_006) into an actual gate — but SAFELY.
-- A naive "every courier must be VERIFIED" would strand every existing courier
-- (none have a KYC row yet) and break all dispatch. Instead this is a per-fleet
-- switch (courier_fleets.kyc_required, DEFAULT false): a fleet only starts
-- enforcing once it has onboarded + verified its couriers. With the default,
-- nothing changes for anyone.
--
-- A single helper, courier_can_take_orders(), is the source of truth and is
-- called from every take-order path (self-pickup, acceptOrderAction, and the
-- offer_courier_order engine RPC), so no path can bypass it.

-- 1. Per-fleet flag (default OFF -> no behavior change anywhere) ----------------
alter table public.courier_fleets
  add column if not exists kyc_required boolean not null default false;

comment on column public.courier_fleets.kyc_required is
  'Fleet marketplace Phase 3: when true, couriers in this fleet must have a '
  'VERIFIED courier_kyc row to take orders. Default false. Flip to true per '
  'fleet only AFTER its couriers are onboarded/verified (else dispatch stalls).';

-- 2. Single source of truth for "may this courier take orders?" ----------------
-- TRUE unless the courier''s fleet requires KYC and the courier is not VERIFIED.
-- Null-fleet couriers (platform-default) are never blocked.
create or replace function public.courier_can_take_orders(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not exists (
    select 1
    from public.courier_profiles cp
    join public.courier_fleets cf on cf.id = cp.fleet_id
    where cp.user_id = p_user_id
      and cf.kyc_required = true
      and not exists (
        select 1 from public.courier_kyc k
        where k.courier_user_id = p_user_id
          and k.kyc_status = 'VERIFIED'
      )
  );
$$;

comment on function public.courier_can_take_orders(uuid) is
  'Fleet marketplace Phase 3: false only when the courier''s fleet has '
  'kyc_required=true and the courier has no VERIFIED courier_kyc row. The gate '
  'used by every take-order path. Anti-re-brokering enforcement.';

revoke all on function public.courier_can_take_orders(uuid) from public, anon;
grant execute on function public.courier_can_take_orders(uuid) to authenticated, service_role;

-- 3. Enforce in the engine offer path ------------------------------------------
-- Re-create offer_courier_order with the KYC gate (after the ACTIVE-in-fleet
-- check). Body is otherwise identical to 20260630_002.
create or replace function public.offer_courier_order(
  p_order_id        uuid,
  p_courier_user_id uuid,
  p_fleet_id        uuid,
  p_timeout_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status     text;
  v_courier_ok boolean;
  v_expires    timestamptz;
begin
  if p_timeout_seconds is null or p_timeout_seconds < 10 or p_timeout_seconds > 600 then
    return jsonb_build_object('offered', false, 'reason', 'invalid_timeout');
  end if;

  select exists (
    select 1
    from public.courier_profiles
    where user_id = p_courier_user_id
      and fleet_id = p_fleet_id
      and status = 'ACTIVE'
  ) into v_courier_ok;

  if not v_courier_ok then
    return jsonb_build_object('offered', false, 'reason', 'courier_not_active_in_fleet');
  end if;

  -- KYC gate: never offer to a courier whose fleet requires KYC and who is not
  -- VERIFIED. No-op while every fleet has kyc_required=false.
  if not public.courier_can_take_orders(p_courier_user_id) then
    return jsonb_build_object('offered', false, 'reason', 'kyc_required');
  end if;

  v_expires := now() + make_interval(secs => p_timeout_seconds);

  update public.courier_orders
     set status                   = 'OFFERED',
         assigned_courier_user_id = p_courier_user_id,
         fleet_id                 = p_fleet_id,
         offer_expires_at         = v_expires,
         updated_at               = now()
   where id = p_order_id
     and status = 'CREATED'
  returning status into v_status;

  if v_status is null then
    select status into v_status from public.courier_orders where id = p_order_id;
    return jsonb_build_object(
      'offered', false,
      'reason', case when v_status is null then 'order_not_found' else 'not_in_open_pool' end,
      'current_status', v_status
    );
  end if;

  return jsonb_build_object(
    'offered', true,
    'order_id', p_order_id,
    'status', 'OFFERED',
    'offer_expires_at', v_expires
  );
end;
$$;

revoke all on function public.offer_courier_order(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.offer_courier_order(uuid, uuid, uuid, integer) to authenticated, service_role;
