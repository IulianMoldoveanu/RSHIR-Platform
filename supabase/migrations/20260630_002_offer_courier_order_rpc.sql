-- Offer-with-timeout pool primitive (fleet marketplace Phase 1 #2).
--
-- Today NOTHING in the codebase moves a courier_order into OFFERED with an
-- expiry: bidi-sync creates rows as CREATED, reassign only mutates already
-- assigned orders, and Hepi is read-only. This RPC is the missing primitive
-- the managed allocation engine (platform -> fleet -> courier) calls to OFFER
-- an order to a specific courier for a bounded window.
--
-- It performs an ATOMIC claim: the order is moved CREATED -> OFFERED only if it
-- is still in the open pool. Concurrent offers race on the `where status =
-- 'CREATED'` guard, so exactly one caller wins; the rest get offered=false.
-- This is what keeps two fleets from both grabbing the same order.
--
-- offer_expires_at is set to now() + p_timeout_seconds. The lifecycle trigger
-- (20260630_001) stamps offered_at and only fills offer_expires_at via coalesce,
-- so the explicit value set here is preserved. revoke_expired_courier_offers()
-- (the 1-minute pg_cron) reverts the order to CREATED if the courier does not
-- ACCEPT in time -- the "revocable assignment pointer".
--
-- The courier must be ACTIVE in p_fleet_id. This preserves the same-fleet
-- invariant that the reassign endpoint and courier_orders RLS already rely on
-- (a courier may only ever touch orders in their own fleet). fleet_id is set on
-- the order as part of the offer, since the allocation engine decides the fleet.
--
-- Returns jsonb so the (server-side) caller can branch on the outcome without a
-- second round-trip. Idempotent (create or replace).

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
  -- Bound the offer window. 10s floor avoids accidental instant-expiry; 600s
  -- ceiling keeps a stuck offer from holding the pointer for too long.
  if p_timeout_seconds is null or p_timeout_seconds < 10 or p_timeout_seconds > 600 then
    return jsonb_build_object('offered', false, 'reason', 'invalid_timeout');
  end if;

  -- Courier eligibility: must be ACTIVE in the target fleet (same-fleet
  -- invariant). Defense-in-depth -- the engine should pre-filter, but offering
  -- to a courier outside the fleet would break reassign + RLS assumptions.
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

  v_expires := now() + make_interval(secs => p_timeout_seconds);

  -- Atomic claim: only an order still in the open pool (CREATED) can be offered.
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
    -- Lost the race, wrong state, or no such order. Report which.
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

comment on function public.offer_courier_order(uuid, uuid, uuid, integer) is
  'Fleet marketplace Phase 1: atomically offers a CREATED courier_order to a '
  'courier in p_fleet_id for p_timeout_seconds (sets status=OFFERED + '
  'assigned_courier_user_id + offer_expires_at). Returns jsonb {offered, ...}. '
  'Exactly one concurrent caller wins the CREATED->OFFERED claim. '
  'revoke_expired_courier_offers() reverts it to CREATED if not ACCEPTED in time.';

-- Lock down execute. Supabase default privileges auto-grant execute to anon +
-- authenticated on function creation, so `revoke from public` alone leaves an
-- explicit anon grant in place. This is a privileged write primitive (it claims
-- order assignments) -- anon (unauthenticated) must never reach it. The real
-- caller is the server-side allocation engine via service_role.
revoke all on function public.offer_courier_order(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.offer_courier_order(uuid, uuid, uuid, integer) to authenticated, service_role;
