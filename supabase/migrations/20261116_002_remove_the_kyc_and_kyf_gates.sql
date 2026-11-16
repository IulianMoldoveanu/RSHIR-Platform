-- KYC (per courier) and KYF (per fleet) are removed from the product.
-- Verification happens by hand at the start, outside the software.
--
-- Both lived behind one function. `courier_can_take_orders(uuid)` was built as
-- the single source of truth precisely so that a gate could be added or taken
-- away in one place, and every take-order path already calls it:
--
--     offer_courier_order            -> returns {offered:false, reason:'kyc_required'}
--     fn_auto_dispatch_sweep         -> skips the courier
--     sync_restaurant_to_courier_order
--
-- So the gate is emptied rather than deleted. Nothing else changes: no call
-- site is edited, no dispatch function is re-created, and if a gate is ever
-- wanted again there is exactly one place to put it back. Deleting the
-- function instead would mean rewriting three live dispatch functions, which
-- is the operation that has cost us working guards before.
--
-- Checked against the LIVE definitions first, not the migration files: of the
-- nine functions that mention KYC or KYF, only this one decides anything.
-- `offer_courier_order` reads `kyc_required` solely inside a comment, and
-- `courier_is_kyc_verified` / `fleet_is_kyf_verified` / `submit_courier_kyc` /
-- `submit_fleet_kyf` are helpers nothing will call once the screens are gone.
--
-- Live state at the time of the change: Els had kyc_required=true and
-- kyf_required=true with both VERIFIED, so its courier was passing. Two
-- other fleets had kyf_required=true. After this, the flags decide nothing.
--
-- The tables (courier_kyc, fleet_kyf) and their submission RPCs are left in
-- place. They hold identity documents, so dropping them is a data decision,
-- not a cleanup one — and keeping them costs nothing once no screen writes to
-- them. fn_purge_30day_retention keeps pruning what is already there.

create or replace function public.courier_can_take_orders(p_user_id uuid)
returns boolean
language sql
immutable
security definer
set search_path to 'public'
as $$
  -- No identity gate. Kept as the single hook every take-order path calls.
  select true;
$$;

comment on function public.courier_can_take_orders(uuid) is
  'Always true: KYC and KYF were removed from the product on 2026-11-16 and '
  'verification is done by hand. Kept as the one place a take-order gate '
  'would go, since offer_courier_order, fn_auto_dispatch_sweep and '
  'sync_restaurant_to_courier_order all call it.';

-- The flags no longer decide anything. Set them false so the data says what
-- the code does, and nobody reads a `true` here as an active requirement.
update public.courier_fleets
   set kyc_required = false
 where kyc_required = true;

update public.courier_fleets
   set kyf_required = false
 where kyf_required = true;

revoke all on function public.courier_can_take_orders(uuid) from public, anon;
grant execute on function public.courier_can_take_orders(uuid) to authenticated, service_role;
