-- Fleet-level KYF operate-gate (fleet marketplace Phase 3 — P5).
--
-- KYC (per-courier, #835) is already enforced through courier_can_take_orders.
-- This adds the company-level analogue: a fleet whose kyf_required = true may
-- only operate (take orders) once it has a VERIFIED fleet_kyf row. Same SAFE
-- per-fleet pattern as kyc_required — DEFAULT false, so nothing changes for any
-- existing fleet until the platform flips it on (after KYF verification).
--
-- Implemented by extending the single source of truth, courier_can_take_orders,
-- which every take-order path already calls (offer_courier_order, self-pickup,
-- acceptOrderAction). Blocking every courier of an unverified-but-required fleet
-- effectively stops that fleet from operating, with zero new call sites.

alter table public.courier_fleets
  add column if not exists kyf_required boolean not null default false;

comment on column public.courier_fleets.kyf_required is
  'Fleet marketplace Phase 3: when true, the fleet must have a VERIFIED fleet_kyf '
  'row to take orders. Default false. Flip to true per fleet only AFTER its KYF '
  'is verified (else its couriers stall).';

-- Re-create the gate with BOTH checks. TRUE unless:
--   (a) the fleet requires per-courier KYC and this courier isn't VERIFIED, OR
--   (b) the fleet requires fleet-level KYF and the fleet isn't VERIFIED.
-- Null-fleet couriers (no join match) are never blocked.
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
      and (
        (cf.kyc_required = true and not exists (
          select 1 from public.courier_kyc k
          where k.courier_user_id = p_user_id
            and k.kyc_status = 'VERIFIED'
        ))
        or
        (cf.kyf_required = true and not exists (
          select 1 from public.fleet_kyf f
          where f.fleet_id = cf.id
            and f.kyf_status = 'VERIFIED'
        ))
      )
  );
$$;

comment on function public.courier_can_take_orders(uuid) is
  'Fleet marketplace Phase 3: false when the courier''s fleet requires KYC and '
  'the courier is not VERIFIED, OR the fleet requires KYF and the fleet is not '
  'VERIFIED. The single gate used by every take-order path.';

revoke all on function public.courier_can_take_orders(uuid) from public, anon;
grant execute on function public.courier_can_take_orders(uuid) to authenticated, service_role;
