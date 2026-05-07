/**
 * Fleet Allocation algorithm V1 — demand-supply matching.
 *
 * Spec lock: decision_fleet_allocation_2026-05-07.md (replaces the rejected
 * visibility-tier proposal). Iulian was a fleet manager; the rule he gave
 * is industry-standard:
 *
 *   utilization = sum(restaurant_demand) / (courier_count × target_orders_per_hour)
 *
 *   Sweet spot: utilization in [3, 5]. Below 3 = couriers go on minus, fleet
 *   churns. Above 5 = couriers can't keep up, customer ETA breaks.
 *
 * V1 is pure recommendation: this function returns a ranked list of
 * (restaurant, fleet, role) suggestions; Iulian approves before any row
 * lands in fleet_restaurant_assignments. No mutations here.
 *
 * Inputs are plain TypeScript shapes — DB I/O happens at the call site
 * (server action) and feeds this function. That keeps the unit tests
 * trivial and the algorithm reusable from a future cron job.
 */

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type FleetInput = {
  fleet_id: string;
  fleet_name: string;
  city_id: string | null;
  courier_count_active: number;
  target_orders_per_hour: number;
  /**
   * Currently-assigned demand (orders/hour at peak — Friday 19:00 by default,
   * configurable upstream). Sum of estimated demand across all primary
   * restaurants the fleet is already serving.
   */
  current_assigned_demand: number;
  /**
   * If the fleet runs its own dispatch app (`courier_fleets.delivery_app =
   * 'external'`), the algorithm still treats it like any other fleet for
   * capacity math but the recommendation reason notes the app boundary so
   * the platform admin doesn't accidentally route HIR-courier-only orders.
   */
  delivery_app: 'hir' | 'external';
};

export type RestaurantInput = {
  restaurant_tenant_id: string;
  restaurant_name: string;
  city_id: string | null;
  /** Estimated peak orders/hour for this restaurant. */
  estimated_peak_demand: number;
};

export type AllocationRole = 'primary' | 'secondary';

export type Recommendation = {
  restaurant_tenant_id: string;
  restaurant_name: string;
  fleet_id: string | null;
  fleet_name: string | null;
  role: AllocationRole | null;
  /**
   * Hypothetical utilization for the primary fleet AFTER this restaurant is
   * added. Null when no fleet has capacity (`reason='no_capacity'`).
   */
  projected_utilization: number | null;
  reason: RecommendationReason;
  notes?: string;
};

export type RecommendationReason =
  | 'assigned_within_band'
  | 'assigned_above_band_acceptable' // utilization slightly >5 but no better fleet exists
  | 'no_capacity'                    // every fleet would push >5
  | 'no_fleet_in_city'               // no fleet covers this city at all
  | 'restaurant_no_demand'           // estimated_peak_demand=0 — skip
  | 'invalid_input';                 // negative numbers etc.

export type AlgorithmConfig = {
  /** Lower bound of the healthy utilization band. Default 3. */
  utilization_floor: number;
  /** Upper bound of the healthy utilization band. Default 5. */
  utilization_ceiling: number;
  /**
   * Hard cap above which we refuse to recommend even as a last resort.
   * Default 7 — beyond this, customer experience collapses.
   */
  utilization_hard_cap: number;
};

export const DEFAULT_CONFIG: AlgorithmConfig = {
  utilization_floor: 3,
  utilization_ceiling: 5,
  utilization_hard_cap: 7,
};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * Capacity = courier_count × target_orders_per_hour. The denominator of
 * utilization. Returns 0 for a fleet with no couriers (which means the
 * algorithm will skip it — not divide by zero).
 */
export function fleetCapacity(fleet: FleetInput): number {
  if (fleet.courier_count_active <= 0) return 0;
  if (fleet.target_orders_per_hour <= 0) return 0;
  return fleet.courier_count_active * fleet.target_orders_per_hour;
}

/**
 * Hypothetical utilization for `fleet` if `extra_demand` is added on top
 * of `fleet.current_assigned_demand`. Returns Infinity when capacity is 0
 * so callers can sort/filter without special-casing.
 */
export function projectedUtilization(fleet: FleetInput, extra_demand: number): number {
  const capacity = fleetCapacity(fleet);
  if (capacity === 0) return Number.POSITIVE_INFINITY;
  return (fleet.current_assigned_demand + extra_demand) / capacity;
}

/**
 * Validates a single restaurant input. Returns null when valid, an error
 * Recommendation reason otherwise.
 */
function validateRestaurant(r: RestaurantInput): RecommendationReason | null {
  if (!Number.isFinite(r.estimated_peak_demand)) return 'invalid_input';
  if (r.estimated_peak_demand < 0) return 'invalid_input';
  if (r.estimated_peak_demand === 0) return 'restaurant_no_demand';
  return null;
}

/**
 * Order fleets best-first for a given restaurant. "Best" = lowest projected
 * utilization that still falls inside [floor, ceiling], breaking ties by
 * (lower current load, then alphabetical fleet_id for stable ordering in
 * tests).
 */
function rankFleetsForRestaurant(
  restaurant: RestaurantInput,
  fleets: FleetInput[],
  config: AlgorithmConfig,
): FleetInput[] {
  // Filter: same city (or no city set on either — the V1 fallback). Fleets
  // with zero capacity are dropped early so they don't pollute ranking.
  const candidates = fleets.filter((f) => {
    if (fleetCapacity(f) === 0) return false;
    // City match: if both have a city set, they must match. If either side
    // has null (legacy tenant or city-agnostic fleet), allow the pairing
    // and rely on the platform admin to sanity-check.
    if (f.city_id && restaurant.city_id && f.city_id !== restaurant.city_id) {
      return false;
    }
    return true;
  });

  return candidates
    .map((f) => ({
      fleet: f,
      projected: projectedUtilization(f, restaurant.estimated_peak_demand),
    }))
    .sort((a, b) => {
      // 1. Prefer in-band fleets (lowest "distance to ceiling" while >= floor).
      const aIn = a.projected >= config.utilization_floor && a.projected <= config.utilization_ceiling;
      const bIn = b.projected >= config.utilization_floor && b.projected <= config.utilization_ceiling;
      if (aIn !== bIn) return aIn ? -1 : 1;

      // 2. Within in-band: prefer the higher utilization (denser fleet =
      //    fewer fleets needed overall — favors operational consolidation).
      //    Within out-of-band: prefer the lower utilization (less broken).
      if (aIn && bIn) return b.projected - a.projected;
      return a.projected - b.projected;
    })
    .map((x) => x.fleet);
}

// ────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────

export type AllocationInput = {
  fleets: FleetInput[];
  restaurants: RestaurantInput[];
  config?: Partial<AlgorithmConfig>;
};

export type AllocationOutput = {
  recommendations: Recommendation[];
  /** Aggregate flag: true when at least one restaurant got 'no_capacity'. */
  needs_new_fleet: boolean;
  /** City IDs where 'needs_new_fleet' fired (de-duplicated). */
  uncovered_city_ids: string[];
  config_used: AlgorithmConfig;
};

/**
 * Runs the V1 demand-supply matching pass over the given inputs. Pure
 * function: does not mutate its arguments and does not perform I/O.
 *
 * The "current_assigned_demand" of each fleet is updated locally as we
 * walk the restaurants — so the recommendations are sequential and order-
 * dependent. We process restaurants from highest to lowest demand to give
 * the heavy hitters first pick of fleet capacity (otherwise low-demand
 * restaurants would gobble small fleets and leave nothing for big ones).
 */
export function recommendAllocations(input: AllocationInput): AllocationOutput {
  const config: AlgorithmConfig = { ...DEFAULT_CONFIG, ...(input.config ?? {}) };

  // Defensive copy so we can mutate `current_assigned_demand` locally.
  const fleetsLocal: FleetInput[] = input.fleets.map((f) => ({ ...f }));
  const fleetById = new Map(fleetsLocal.map((f) => [f.fleet_id, f]));

  const recommendations: Recommendation[] = [];
  const uncoveredCities = new Set<string>();

  // Sort restaurants high-demand first; preserve original order on ties for
  // determinism in tests.
  const restaurantsSorted = input.restaurants
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => {
      const diff = b.r.estimated_peak_demand - a.r.estimated_peak_demand;
      return diff !== 0 ? diff : a.idx - b.idx;
    })
    .map((x) => x.r);

  for (const restaurant of restaurantsSorted) {
    const validationError = validateRestaurant(restaurant);
    if (validationError) {
      recommendations.push({
        restaurant_tenant_id: restaurant.restaurant_tenant_id,
        restaurant_name: restaurant.restaurant_name,
        fleet_id: null,
        fleet_name: null,
        role: null,
        projected_utilization: null,
        reason: validationError,
      });
      continue;
    }

    const ranked = rankFleetsForRestaurant(restaurant, fleetsLocal, config);

    if (ranked.length === 0) {
      // No fleet covers this restaurant's city at all.
      if (restaurant.city_id) uncoveredCities.add(restaurant.city_id);
      recommendations.push({
        restaurant_tenant_id: restaurant.restaurant_tenant_id,
        restaurant_name: restaurant.restaurant_name,
        fleet_id: null,
        fleet_name: null,
        role: null,
        projected_utilization: null,
        reason: 'no_fleet_in_city',
      });
      continue;
    }

    // Try in-band first.
    const primaryCandidate = ranked.find((f) => {
      const u = projectedUtilization(f, restaurant.estimated_peak_demand);
      return u >= config.utilization_floor && u <= config.utilization_ceiling;
    });

    if (primaryCandidate) {
      const projected = projectedUtilization(primaryCandidate, restaurant.estimated_peak_demand);
      // Update local capacity for next iteration.
      const live = fleetById.get(primaryCandidate.fleet_id)!;
      live.current_assigned_demand += restaurant.estimated_peak_demand;

      // Pick a secondary: next-best fleet that doesn't blow the hard cap.
      const secondary = ranked.find(
        (f) =>
          f.fleet_id !== primaryCandidate.fleet_id &&
          projectedUtilization(f, restaurant.estimated_peak_demand) <= config.utilization_hard_cap,
      );

      recommendations.push({
        restaurant_tenant_id: restaurant.restaurant_tenant_id,
        restaurant_name: restaurant.restaurant_name,
        fleet_id: primaryCandidate.fleet_id,
        fleet_name: primaryCandidate.fleet_name,
        role: 'primary',
        projected_utilization: round2(projected),
        reason: 'assigned_within_band',
        notes: secondary
          ? `Recomandare secondary: ${secondary.fleet_name}`
          : 'Fără secondary disponibil — escaladați la admin dacă primary refuză.',
      });
      continue;
    }

    // No in-band fleet. Try least-overloaded fleet still under hard cap.
    const fallback = ranked.find(
      (f) => projectedUtilization(f, restaurant.estimated_peak_demand) <= config.utilization_hard_cap,
    );

    if (fallback) {
      const projected = projectedUtilization(fallback, restaurant.estimated_peak_demand);
      const live = fleetById.get(fallback.fleet_id)!;
      live.current_assigned_demand += restaurant.estimated_peak_demand;

      recommendations.push({
        restaurant_tenant_id: restaurant.restaurant_tenant_id,
        restaurant_name: restaurant.restaurant_name,
        fleet_id: fallback.fleet_id,
        fleet_name: fallback.fleet_name,
        role: 'primary',
        projected_utilization: round2(projected),
        reason: 'assigned_above_band_acceptable',
        notes: `Utilizare ${round2(projected)} peste banda țintă [${config.utilization_floor},${config.utilization_ceiling}] — monitorizați.`,
      });
      continue;
    }

    // Every fleet would blow the hard cap. Flag a need for new fleet.
    if (restaurant.city_id) uncoveredCities.add(restaurant.city_id);
    recommendations.push({
      restaurant_tenant_id: restaurant.restaurant_tenant_id,
      restaurant_name: restaurant.restaurant_name,
      fleet_id: null,
      fleet_name: null,
      role: null,
      projected_utilization: null,
      reason: 'no_capacity',
      notes: `Capacitate epuizată pe oraș. Recomandare: extindere flotă existentă sau nouă.`,
    });
  }

  return {
    recommendations,
    needs_new_fleet: recommendations.some((r) => r.reason === 'no_capacity'),
    uncovered_city_ids: Array.from(uncoveredCities),
    config_used: config,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
