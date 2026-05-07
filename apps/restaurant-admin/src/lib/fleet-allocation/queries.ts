/**
 * Fleet Allocation V1 — DB I/O helpers (server-side, service-role).
 *
 * Pure-data helpers separating Supabase reads from the React/server-action
 * layer. Keeps the page + actions thin and testable.
 *
 * Confidentiality: every function in this module reads internal-only
 * tables (`fleet_*`, `courier_fleets`). Callers MUST be platform-admin
 * gated. None of these rows ever leak to merchants — they appear only on
 * the platform-admin grid.
 */

import { createAdminClient } from '@/lib/supabase/admin';

// ────────────────────────────────────────────────────────────────────────
// Types — what the page consumes
// ────────────────────────────────────────────────────────────────────────

export type FleetRow = {
  id: string;
  name: string;
  slug: string;
  delivery_app: 'hir' | 'external';
  is_active: boolean;
  active_courier_count: number;
  /** Sum of zones.target_orders_per_hour weighted by zones.capacity_courier_count.
   *  Falls back to a flat 4 when no zones declared (industry midpoint). */
  target_orders_per_hour: number;
};

export type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  city_id: string | null;
  city_name: string | null;
};

export type AssignmentRow = {
  id: string;
  fleet_id: string;
  restaurant_tenant_id: string;
  role: 'primary' | 'secondary';
  status: 'active' | 'paused' | 'terminated';
  assigned_at: string;
  notes: string | null;
};

export type FleetAllocationGridData = {
  fleets: FleetRow[];
  restaurants: RestaurantRow[];
  assignments: AssignmentRow[];
};

// ────────────────────────────────────────────────────────────────────────
// loadGridData — single fan-out for the page
//
// Reads (in parallel, via service-role admin client):
//   - all active courier_fleets + active courier counts (grouped)
//   - all tenants joined to canonical city
//   - all fleet_restaurant_assignments
//
// We intentionally fetch ALL rows; pilot scale (≤30 tenants × ≤10 fleets)
// is well below pagination thresholds. When we cross 100 tenants the grid
// grows a city filter (PR1c).
// ────────────────────────────────────────────────────────────────────────
export async function loadGridData(): Promise<FleetAllocationGridData> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const [fleetsRes, tenantsRes, assignmentsRes, courierCountsRes, zonesRes] =
    await Promise.all([
      sb
        .from('courier_fleets')
        .select('id, name, slug, delivery_app, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true }),
      sb
        .from('tenants')
        .select('id, name, slug, city_id, cities!tenants_city_id_fkey ( name )')
        .order('name', { ascending: true }),
      sb
        .from('fleet_restaurant_assignments')
        .select('id, fleet_id, restaurant_tenant_id, role, status, assigned_at, notes'),
      sb
        .from('courier_profiles')
        .select('fleet_id, status')
        .eq('status', 'ACTIVE'),
      sb
        .from('fleet_zones')
        .select('fleet_id, capacity_courier_count, target_orders_per_hour, is_active')
        .eq('is_active', true),
    ]);

  if (fleetsRes.error) throw new Error(`fleets: ${fleetsRes.error.message}`);
  if (tenantsRes.error) throw new Error(`tenants: ${tenantsRes.error.message}`);
  if (assignmentsRes.error)
    throw new Error(`assignments: ${assignmentsRes.error.message}`);
  if (courierCountsRes.error)
    throw new Error(`courier_profiles: ${courierCountsRes.error.message}`);
  if (zonesRes.error) throw new Error(`fleet_zones: ${zonesRes.error.message}`);

  // Aggregate active courier counts per fleet.
  const courierCountByFleet = new Map<string, number>();
  for (const row of (courierCountsRes.data ?? []) as { fleet_id: string }[]) {
    courierCountByFleet.set(row.fleet_id, (courierCountByFleet.get(row.fleet_id) ?? 0) + 1);
  }

  // Aggregate target_orders_per_hour per fleet — weighted average by zone
  // capacity. Falls back to default 4 when fleet has no zones (PR1c will
  // surface the zone editor; for now we assume every fleet inherits the
  // industry midpoint).
  const zoneAggByFleet = new Map<string, { weightedSum: number; capacity: number }>();
  for (const z of (zonesRes.data ?? []) as {
    fleet_id: string;
    capacity_courier_count: number;
    target_orders_per_hour: number;
  }[]) {
    const cur = zoneAggByFleet.get(z.fleet_id) ?? { weightedSum: 0, capacity: 0 };
    cur.weightedSum += z.target_orders_per_hour * z.capacity_courier_count;
    cur.capacity += z.capacity_courier_count;
    zoneAggByFleet.set(z.fleet_id, cur);
  }

  type FleetRaw = {
    id: string;
    name: string;
    slug: string;
    delivery_app: string | null;
    is_active: boolean;
  };
  const fleets: FleetRow[] = ((fleetsRes.data ?? []) as FleetRaw[]).map((f) => {
    const agg = zoneAggByFleet.get(f.id);
    const target =
      agg && agg.capacity > 0 ? Math.max(1, Math.round(agg.weightedSum / agg.capacity)) : 4;
    return {
      id: f.id,
      name: f.name,
      slug: f.slug,
      delivery_app: f.delivery_app === 'external' ? 'external' : 'hir',
      is_active: f.is_active,
      active_courier_count: courierCountByFleet.get(f.id) ?? 0,
      target_orders_per_hour: target,
    };
  });

  type TenantRaw = {
    id: string;
    name: string;
    slug: string;
    city_id: string | null;
    cities: { name: string } | { name: string }[] | null;
  };
  const restaurants: RestaurantRow[] = ((tenantsRes.data ?? []) as TenantRaw[]).map((t) => {
    // PostgREST returns the joined object as either a single row or an array;
    // normalize to a single object for our consumer.
    const city = Array.isArray(t.cities) ? t.cities[0] : t.cities;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      city_id: t.city_id,
      city_name: city?.name ?? null,
    };
  });

  const assignments: AssignmentRow[] = (assignmentsRes.data ?? []) as AssignmentRow[];

  return { fleets, restaurants, assignments };
}

// ────────────────────────────────────────────────────────────────────────
// loadDemandEstimates — for the recommendations panel
//
// Sums (city_id, day_of_week, hour) across `manual` + `self_estimate`
// sources for a given peak slot (default Friday 19:00). Auto-source rows
// land in V2.
// ────────────────────────────────────────────────────────────────────────
export type CityDemand = {
  city_id: string;
  estimated_orders: number;
};

export async function loadDemandEstimatesForSlot(
  day_of_week: number,
  hour: number,
): Promise<Map<string, number>> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data, error } = await sb
    .from('fleet_demand_estimates')
    .select('city_id, estimated_orders')
    .eq('day_of_week', day_of_week)
    .eq('hour', hour)
    .in('source', ['manual', 'self_estimate']);

  if (error) throw new Error(`fleet_demand_estimates: ${error.message}`);

  const byCity = new Map<string, number>();
  for (const row of (data ?? []) as { city_id: string; estimated_orders: number }[]) {
    byCity.set(row.city_id, (byCity.get(row.city_id) ?? 0) + row.estimated_orders);
  }
  return byCity;
}
