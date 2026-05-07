/**
 * Pure mapping from grid + demand inputs into algorithm-input shape.
 *
 * Extracted so the orchestration is unit-testable without standing up
 * Supabase mocks. The server action `runRecommendations` calls this with
 * data fetched via service-role queries.
 */

import type { FleetInput, RestaurantInput } from './algorithm';
import type { AssignmentRow, FleetRow, RestaurantRow } from './queries';

export type GridSnapshot = {
  fleets: FleetRow[];
  restaurants: RestaurantRow[];
  assignments: AssignmentRow[];
};

export type AlgorithmInputs = {
  fleets: FleetInput[];
  restaurants: RestaurantInput[];
};

/**
 * Distributes city-level demand uniformly across restaurants in that city,
 * computes each fleet's `current_assigned_demand` from its active primary
 * rows, and infers each fleet's "city" as the most common city across its
 * already-active primaries. PR1d will replace the uniform-share heuristic
 * with per-tenant self-estimate rows.
 */
export function buildAlgorithmInputs(
  grid: GridSnapshot,
  demandByCity: Map<string, number>,
): AlgorithmInputs {
  // 1. Restaurant per-tenant demand share — uniform across the city's
  //    restaurants. Restaurants without a city contribute zero demand
  //    (algorithm tags them `restaurant_no_demand`).
  const restaurantsByCity = new Map<string, RestaurantRow[]>();
  for (const r of grid.restaurants) {
    if (!r.city_id) continue;
    const arr = restaurantsByCity.get(r.city_id) ?? [];
    arr.push(r);
    restaurantsByCity.set(r.city_id, arr);
  }

  const restaurantDemand = new Map<string, number>();
  for (const r of grid.restaurants) {
    if (!r.city_id) {
      restaurantDemand.set(r.id, 0);
      continue;
    }
    const sameCity = restaurantsByCity.get(r.city_id)!.length;
    const cityDemand = demandByCity.get(r.city_id) ?? 0;
    restaurantDemand.set(r.id, sameCity > 0 ? cityDemand / sameCity : 0);
  }

  // 2. Per-fleet current load = sum of restaurant_demand for the
  //    restaurants where this fleet is an ACTIVE primary.
  const activePrimaryByFleet = new Map<string, number>();
  for (const a of grid.assignments) {
    if (a.role !== 'primary' || a.status !== 'active') continue;
    activePrimaryByFleet.set(
      a.fleet_id,
      (activePrimaryByFleet.get(a.fleet_id) ?? 0) +
        (restaurantDemand.get(a.restaurant_tenant_id) ?? 0),
    );
  }

  // 3. Fleet city = mode of cities across its active primaries. When tied,
  //    pick the lexicographically smaller city_id for deterministic ordering
  //    (avoids flaky test runs and keeps the recommendation reproducible).
  const fleetCity = new Map<string, string | null>();
  const restaurantById = new Map(grid.restaurants.map((r) => [r.id, r]));
  for (const f of grid.fleets) {
    const cities = grid.assignments
      .filter((a) => a.fleet_id === f.id && a.status === 'active')
      .map((a) => restaurantById.get(a.restaurant_tenant_id)?.city_id ?? null)
      .filter((c): c is string => Boolean(c));
    if (cities.length === 0) {
      fleetCity.set(f.id, null);
      continue;
    }
    const counts = new Map<string, number>();
    for (const c of cities) counts.set(c, (counts.get(c) ?? 0) + 1);
    const top = Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })[0];
    fleetCity.set(f.id, top[0]);
  }

  const fleets: FleetInput[] = grid.fleets.map((f) => ({
    fleet_id: f.id,
    fleet_name: f.name,
    city_id: fleetCity.get(f.id) ?? null,
    courier_count_active: f.active_courier_count,
    target_orders_per_hour: f.target_orders_per_hour,
    current_assigned_demand: activePrimaryByFleet.get(f.id) ?? 0,
    delivery_app: f.delivery_app,
  }));

  const restaurants: RestaurantInput[] = grid.restaurants.map((r) => ({
    restaurant_tenant_id: r.id,
    restaurant_name: r.name,
    city_id: r.city_id,
    estimated_peak_demand: restaurantDemand.get(r.id) ?? 0,
  }));

  return { fleets, restaurants };
}
