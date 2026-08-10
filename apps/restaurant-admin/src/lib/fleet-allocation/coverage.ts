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
 *   2. otherwise fall back to an active `tier='owner'` fleet that has at
 *      least one ACTIVE courier (added 20260810_002);
 *   3. otherwise any active `tier='owner'` fleet;
 *   4. otherwise the trigger raises.
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

  // Step 2 of the trigger: is there a staffed owner-tier fleet to fall back on?
  const staffedOwnerFleet = fleets.find(
    (f) => f.tier === 'owner' && f.is_active && f.active_courier_count > 0,
  );
  // Step 3: any active owner fleet, staffed or not.
  const anyOwnerFleet = fleets.find((f) => f.tier === 'owner' && f.is_active);

  const gaps: CoverageGap[] = [];

  for (const t of restaurants) {
    // Only a live vendor that actually needs a HIR courier can be stranded.
    if (t.status !== 'ACTIVE') continue;
    if (t.external_dispatch_enabled) continue;

    // Step 1: most recent active assignment to a still-active fleet.
    const active = assignments
      .filter((a) => a.restaurant_tenant_id === t.id && a.status === 'active')
      .filter((a) => fleetById.get(a.fleet_id)?.is_active === true)
      .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1));

    if (active.length > 0) {
      // An assigned vendor is fine as long as ANY of its active fleets has
      // riders — the dispatcher is not limited to the newest assignment once
      // a human reassigns, and a secondary fleet is a real fallback.
      const servable = active.some(
        (a) => (fleetById.get(a.fleet_id)?.active_courier_count ?? 0) > 0,
      );
      if (servable) continue;
      gaps.push({
        tenantId: t.id,
        name: t.name,
        cityName: t.city_name,
        reason: 'assigned_fleet_has_no_couriers',
        fleetName: fleetById.get(active[0].fleet_id)?.name ?? null,
      });
      continue;
    }

    // No assignment: the trigger falls back to an owner fleet.
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
