/**
 * Which live vendors currently have nobody who can deliver for them.
 *
 * The 2026-08-10 Bucharest load test found that a vendor with no fleet
 * assignment produces undeliverable orders in complete silence: the
 * restaurant accepts the order, cooks it, marks it READY, and the courier
 * leg is created in a fleet with no riders, so it is never offered to
 * anyone. Nothing failed and nothing warned — the order simply sat there.
 *
 * courier-health-monitor now catches it after the fact (orders_unstaffed_fleet).
 * This catches it *before* an order exists, on the screen where the fix is a
 * single click.
 *
 * This mirrors sync_restaurant_to_courier_order's fleet resolution exactly.
 * If that trigger changes, change this with it, or the grid will reassure an
 * admin about a vendor the database cannot actually serve:
 *
 *   1. the most recent `active` assignment to an active fleet wins;
 *   2. otherwise an active fleet in the tenant's own city that has at least
 *      one dispatchable courier (added 20260909_001);
 *   3. otherwise fall back to an active `tier='owner'` fleet that has at
 *      least one dispatchable courier (added 20260810_002);
 *   4. otherwise any active `tier='owner'` fleet;
 *   5. otherwise the trigger raises.
 *
 * "Dispatchable" throughout means what fn_auto_dispatch_sweep means: ACTIVE in
 * the fleet AND past the fleet's KYC/KYF gate. active_courier_count carries
 * that number (20260909_003), not the raw ACTIVE headcount.
 */
import type { AssignmentRow, FleetRow, RestaurantRow } from './queries';

export type CoverageGap = {
  tenantId: string;
  name: string;
  cityName: string | null;
  reason: 'no_fleet_assigned' | 'assigned_fleet_has_no_couriers';
  /** The fleet the trigger would actually route to, when there is one. */
  fleetName: string | null;
};

export function findCoverageGaps(input: {
  fleets: FleetRow[];
  restaurants: RestaurantRow[];
  assignments: AssignmentRow[];
}): CoverageGap[] {
  const { fleets, restaurants, assignments } = input;
  const fleetById = new Map(fleets.map((f) => [f.id, f]));

  // Step 2 of the trigger: a staffed fleet in the tenant's own city. Ordered
  // the way the trigger orders it — owner tier first, then oldest — so the
  // fleet named here is the fleet the database would actually pick.
  const staffedFleetInCity = (cityId: string | null) =>
    cityId === null
      ? undefined
      : fleets
          .filter((f) => f.is_active && f.primary_city_id === cityId && f.active_courier_count > 0)
          .sort((a, b) => Number(b.tier === 'owner') - Number(a.tier === 'owner'))[0];

  // Step 3: is there a staffed owner-tier fleet to fall back on?
  const staffedOwnerFleet = fleets.find(
    (f) => f.tier === 'owner' && f.is_active && f.active_courier_count > 0,
  );
  // Step 4: any active owner fleet, staffed or not.
  const anyOwnerFleet = fleets.find((f) => f.tier === 'owner' && f.is_active);

  const gaps: CoverageGap[] = [];

  for (const t of restaurants) {
    // Only a live vendor that actually needs a HIR courier can be stranded.
    if (t.status !== 'ACTIVE') continue;
    if (t.external_dispatch_enabled) continue;

    // Step 1: most recent active assignment to a still-active fleet.
    // `nulls last`, matching the trigger's ordering.
    const active = assignments
      .filter((a) => a.restaurant_tenant_id === t.id && a.status === 'active')
      .filter((a) => fleetById.get(a.fleet_id)?.is_active === true)
      .sort((a, b) => {
        if (!a.assigned_at && !b.assigned_at) return 0;
        if (!a.assigned_at) return 1;
        if (!b.assigned_at) return -1;
        return a.assigned_at < b.assigned_at ? 1 : a.assigned_at > b.assigned_at ? -1 : 0;
      });

    if (active.length > 0) {
      // ONLY the newest assignment matters. The trigger does
      // `order by fra.assigned_at desc nulls last limit 1` and stops there —
      // it does not try a secondary fleet when the primary has no riders. An
      // earlier version of this function accepted any staffed active
      // assignment as cover, which quietly hid the exact case where a fresh
      // assignment to an empty fleet strands a vendor that also has an older,
      // staffed secondary.
      const chosen = active[0];
      if ((fleetById.get(chosen.fleet_id)?.active_courier_count ?? 0) > 0) continue;
      gaps.push({
        tenantId: t.id,
        name: t.name,
        cityName: t.city_name,
        reason: 'assigned_fleet_has_no_couriers',
        fleetName: fleetById.get(chosen.fleet_id)?.name ?? null,
      });
      continue;
    }

    // No assignment: the trigger tries the tenant's own city first, then an
    // owner fleet.
    if (staffedFleetInCity(t.city_id)) continue;
    if (staffedOwnerFleet) continue;
    gaps.push({
      tenantId: t.id,
      name: t.name,
      cityName: t.city_name,
      reason: 'no_fleet_assigned',
      fleetName: anyOwnerFleet?.name ?? null,
    });
  }

  return gaps;
}
