-- ============================================================================
-- "Active couriers" is not the same number as "couriers dispatch can offer to".
--
-- The fleet-allocation grid counts courier_profiles.status='ACTIVE'. The
-- dispatch sweep additionally requires courier_can_take_orders() — the fleet's
-- own KYC/KYF gate. Today every ACTIVE courier also passes the gate, so the two
-- numbers agree and nothing is visibly wrong. Els courier requires KYC: the
-- moment an unverified rider is added there, the grid would show the fleet as
-- staffed, the go-live gate would let a Bucharest vendor go live behind it, and
-- not one order could ever be offered.
--
-- One view, same predicate as the sweep, so the screen and the engine cannot
-- drift apart.
-- ============================================================================

create or replace view public.v_fleet_dispatchable_couriers
with (security_invoker = on) as
select f.id as fleet_id,
       count(cp.user_id) filter (
         where cp.status = 'ACTIVE' and public.courier_can_take_orders(cp.user_id)
       )::int as dispatchable_courier_count
  from public.courier_fleets f
  left join public.courier_profiles cp on cp.fleet_id = f.id
 group by f.id;

comment on view public.v_fleet_dispatchable_couriers is
  'Per fleet, how many couriers fn_auto_dispatch_sweep could actually offer an '
  'order to: ACTIVE in the fleet AND past courier_can_take_orders(). Read by '
  'the fleet-allocation coverage check so the grid cannot call a fleet staffed '
  'when dispatch considers it empty.';
