import { describe, it, expect } from 'vitest';
import {
  recommendAllocations,
  fleetCapacity,
  projectedUtilization,
  DEFAULT_CONFIG,
  type FleetInput,
  type RestaurantInput,
} from './algorithm';

// ────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────────────────

const CITY_BV = 'aaaaaaaa-0000-0000-0000-000000000001'; // Brașov
const CITY_BUC = 'aaaaaaaa-0000-0000-0000-000000000002'; // București

function makeFleet(overrides: Partial<FleetInput> = {}): FleetInput {
  // NB: use `'city_id' in overrides` to honor an explicit `null` override
  // (vs `??` which would replace null with the default CITY_BV).
  return {
    fleet_id: overrides.fleet_id ?? 'fleet-default',
    fleet_name: overrides.fleet_name ?? 'Default Fleet',
    city_id: 'city_id' in overrides ? overrides.city_id! : CITY_BV,
    courier_count_active: overrides.courier_count_active ?? 5,
    target_orders_per_hour: overrides.target_orders_per_hour ?? 4,
    current_assigned_demand: overrides.current_assigned_demand ?? 0,
    delivery_app: overrides.delivery_app ?? 'hir',
  };
}

function makeRestaurant(overrides: Partial<RestaurantInput> = {}): RestaurantInput {
  return {
    restaurant_tenant_id: overrides.restaurant_tenant_id ?? 'tenant-default',
    restaurant_name: overrides.restaurant_name ?? 'Default Restaurant',
    city_id: 'city_id' in overrides ? overrides.city_id! : CITY_BV,
    estimated_peak_demand: overrides.estimated_peak_demand ?? 10,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pure helper tests
// ────────────────────────────────────────────────────────────────────────

describe('fleetCapacity', () => {
  it('multiplies courier count and target', () => {
    expect(fleetCapacity(makeFleet({ courier_count_active: 5, target_orders_per_hour: 4 }))).toBe(20);
  });

  it('returns 0 for zero couriers (avoids division by zero downstream)', () => {
    expect(fleetCapacity(makeFleet({ courier_count_active: 0 }))).toBe(0);
  });

  it('returns 0 for zero target/hour', () => {
    expect(fleetCapacity(makeFleet({ target_orders_per_hour: 0 }))).toBe(0);
  });

  it('treats negative inputs as 0 capacity', () => {
    expect(fleetCapacity(makeFleet({ courier_count_active: -1 }))).toBe(0);
    expect(fleetCapacity(makeFleet({ target_orders_per_hour: -3 }))).toBe(0);
  });
});

describe('projectedUtilization', () => {
  it('computes (current + extra) / capacity', () => {
    const f = makeFleet({ courier_count_active: 5, target_orders_per_hour: 4, current_assigned_demand: 10 });
    // capacity = 20, +5 demand → 15/20 = 0.75
    expect(projectedUtilization(f, 5)).toBeCloseTo(0.75);
  });

  it('returns Infinity when capacity is 0', () => {
    const f = makeFleet({ courier_count_active: 0 });
    expect(projectedUtilization(f, 5)).toBe(Number.POSITIVE_INFINITY);
  });

  it('lands inside the [3,5] band when fully loaded at industry profitability', () => {
    // 5 couriers × 4 orders/hr = 20 capacity. 80 demand → util = 4. ✅
    const f = makeFleet({ courier_count_active: 5, target_orders_per_hour: 4 });
    expect(projectedUtilization(f, 80)).toBe(4);
  });
});

// ────────────────────────────────────────────────────────────────────────
// recommendAllocations — happy paths
// ────────────────────────────────────────────────────────────────────────

describe('recommendAllocations — happy paths', () => {
  it('places a single restaurant on a single fleet within band', () => {
    const fleets = [makeFleet({ fleet_id: 'f1', courier_count_active: 5, target_orders_per_hour: 4 })];
    // capacity 20, demand 80 → util = 4 (in band)
    const restaurants = [makeRestaurant({ restaurant_tenant_id: 't1', estimated_peak_demand: 80 })];

    const out = recommendAllocations({ fleets, restaurants });

    expect(out.recommendations).toHaveLength(1);
    expect(out.recommendations[0].fleet_id).toBe('f1');
    expect(out.recommendations[0].role).toBe('primary');
    expect(out.recommendations[0].reason).toBe('assigned_within_band');
    expect(out.recommendations[0].projected_utilization).toBe(4);
    expect(out.needs_new_fleet).toBe(false);
  });

  it('returns config_used reflecting overrides', () => {
    const out = recommendAllocations({
      fleets: [makeFleet()],
      restaurants: [makeRestaurant()],
      config: { utilization_ceiling: 6 },
    });
    expect(out.config_used.utilization_ceiling).toBe(6);
    expect(out.config_used.utilization_floor).toBe(DEFAULT_CONFIG.utilization_floor);
  });

  it('processes restaurants in descending demand order so big ones get fleet pick first', () => {
    const fleets = [
      makeFleet({ fleet_id: 'f1', courier_count_active: 5, target_orders_per_hour: 4 }), // cap 20
    ];
    const restaurants = [
      makeRestaurant({ restaurant_tenant_id: 't-small', estimated_peak_demand: 5 }),
      makeRestaurant({ restaurant_tenant_id: 't-big', estimated_peak_demand: 80 }),
    ];

    const out = recommendAllocations({ fleets, restaurants });

    // Big one was processed first (util = 4, in-band, primary).
    const big = out.recommendations.find((r) => r.restaurant_tenant_id === 't-big');
    const small = out.recommendations.find((r) => r.restaurant_tenant_id === 't-small');

    expect(big?.reason).toBe('assigned_within_band');
    // Small one comes after big consumed capacity → 85/20 = 4.25, still in band.
    expect(small?.reason).toBe('assigned_within_band');
    expect(small?.projected_utilization).toBe(4.25);
  });

  it('adds a secondary recommendation note when another fleet is available', () => {
    const fleets = [
      makeFleet({ fleet_id: 'f1', fleet_name: 'Alpha', courier_count_active: 5, target_orders_per_hour: 4 }),
      makeFleet({ fleet_id: 'f2', fleet_name: 'Beta', courier_count_active: 4, target_orders_per_hour: 4 }),
    ];
    const restaurants = [makeRestaurant({ estimated_peak_demand: 60 })]; // util Alpha=3, Beta=3.75

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].notes).toContain('secondary');
  });

  it('notes "no secondary" when only one fleet exists', () => {
    const fleets = [makeFleet({ fleet_id: 'f1', courier_count_active: 5, target_orders_per_hour: 4 })];
    const restaurants = [makeRestaurant({ estimated_peak_demand: 60 })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].notes).toContain('Fără secondary');
  });

  it('prefers higher in-band utilization (operational consolidation)', () => {
    // f1 already at util 1.0 (low), f2 already at util 2.0 (denser). Restaurant
    // would land in-band on either; we should pick f2 for consolidation.
    const fleets = [
      makeFleet({ fleet_id: 'f1', courier_count_active: 10, target_orders_per_hour: 4, current_assigned_demand: 40 }), // cap 40, util 1.0
      makeFleet({ fleet_id: 'f2', courier_count_active: 10, target_orders_per_hour: 4, current_assigned_demand: 80 }), // cap 40, util 2.0
    ];
    const restaurants = [makeRestaurant({ estimated_peak_demand: 80 })];
    // Adding 80: f1 → 120/40 = 3.0 (in band edge), f2 → 160/40 = 4.0 (in band, denser)
    // We pick f2 (higher in-band utilization).
    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].fleet_id).toBe('f2');
  });
});

// ────────────────────────────────────────────────────────────────────────
// recommendAllocations — edge cases
// ────────────────────────────────────────────────────────────────────────

describe('recommendAllocations — edge cases', () => {
  it('returns no_fleet_in_city when no fleet covers the restaurant city', () => {
    const fleets = [makeFleet({ city_id: CITY_BUC })];
    const restaurants = [makeRestaurant({ city_id: CITY_BV })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].reason).toBe('no_fleet_in_city');
    expect(out.uncovered_city_ids).toContain(CITY_BV);
    // Codex P2 #333 round 2: needs_new_fleet must fire when a city has no
    // eligible fleet at all, not only when capacity is exhausted.
    expect(out.needs_new_fleet).toBe(true);
  });

  it('skips fleets with zero capacity', () => {
    const fleets = [
      makeFleet({ fleet_id: 'dead', courier_count_active: 0 }),
      makeFleet({ fleet_id: 'alive', courier_count_active: 5, target_orders_per_hour: 4 }),
    ];
    const restaurants = [makeRestaurant({ estimated_peak_demand: 80 })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].fleet_id).toBe('alive');
  });

  it('flags no_capacity when every fleet would blow the hard cap', () => {
    // fleet capacity 4 (1 courier × 4/hr), demand 100 → util 25 ≫ cap 7.
    const fleets = [makeFleet({ courier_count_active: 1, target_orders_per_hour: 4 })];
    const restaurants = [makeRestaurant({ estimated_peak_demand: 100 })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].reason).toBe('no_capacity');
    expect(out.needs_new_fleet).toBe(true);
    expect(out.uncovered_city_ids).toContain(CITY_BV);
  });

  it('falls back to assigned_above_band_acceptable when above ceiling but below hard cap', () => {
    // Capacity 20, demand 120 → util 6.0 (above ceiling 5, below hard cap 7).
    const fleets = [makeFleet({ courier_count_active: 5, target_orders_per_hour: 4 })];
    const restaurants = [makeRestaurant({ estimated_peak_demand: 120 })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].reason).toBe('assigned_above_band_acceptable');
    expect(out.recommendations[0].projected_utilization).toBe(6);
    expect(out.recommendations[0].notes).toContain('peste banda');
  });

  it('skips restaurants with zero demand', () => {
    const fleets = [makeFleet()];
    const restaurants = [makeRestaurant({ estimated_peak_demand: 0 })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].reason).toBe('restaurant_no_demand');
    expect(out.recommendations[0].fleet_id).toBeNull();
  });

  it('flags negative demand as invalid_input', () => {
    const fleets = [makeFleet()];
    const restaurants = [makeRestaurant({ estimated_peak_demand: -1 })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].reason).toBe('invalid_input');
  });

  it('flags non-finite demand (NaN/Infinity) as invalid_input', () => {
    const fleets = [makeFleet()];
    const restaurants = [
      makeRestaurant({ restaurant_tenant_id: 't-nan', estimated_peak_demand: Number.NaN }),
      makeRestaurant({ restaurant_tenant_id: 't-inf', estimated_peak_demand: Number.POSITIVE_INFINITY }),
    ];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations.find((r) => r.restaurant_tenant_id === 't-nan')?.reason).toBe('invalid_input');
    expect(out.recommendations.find((r) => r.restaurant_tenant_id === 't-inf')?.reason).toBe('invalid_input');
  });

  it('handles empty fleet list gracefully', () => {
    const out = recommendAllocations({ fleets: [], restaurants: [makeRestaurant()] });
    expect(out.recommendations[0].reason).toBe('no_fleet_in_city');
  });

  it('handles empty restaurant list gracefully', () => {
    const out = recommendAllocations({ fleets: [makeFleet()], restaurants: [] });
    expect(out.recommendations).toHaveLength(0);
    expect(out.needs_new_fleet).toBe(false);
  });

  it('allows a fleet with null city to serve any restaurant (V1 fallback)', () => {
    const fleets = [makeFleet({ city_id: null, courier_count_active: 5, target_orders_per_hour: 4 })];
    const restaurants = [makeRestaurant({ city_id: CITY_BUC, estimated_peak_demand: 80 })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].reason).toBe('assigned_within_band');
  });

  it('allows a restaurant with null city to be served by any fleet', () => {
    const fleets = [makeFleet({ city_id: CITY_BV, courier_count_active: 5, target_orders_per_hour: 4 })];
    const restaurants = [makeRestaurant({ city_id: null, estimated_peak_demand: 80 })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].reason).toBe('assigned_within_band');
  });

  it('updates fleet load between iterations so same fleet can saturate', () => {
    // capacity 20; two restaurants demanding 50 each. First → util 50/20=2.5
    // (below band), second on top → 100/20=5.0 (band edge).
    const fleets = [makeFleet({ fleet_id: 'f1', courier_count_active: 5, target_orders_per_hour: 4 })];
    const restaurants = [
      makeRestaurant({ restaurant_tenant_id: 't1', estimated_peak_demand: 50 }),
      makeRestaurant({ restaurant_tenant_id: 't2', estimated_peak_demand: 50 }),
    ];

    const out = recommendAllocations({ fleets, restaurants });
    // Both get the same fleet; the second has higher projected util (closer to ceiling).
    const t1 = out.recommendations.find((r) => r.restaurant_tenant_id === 't1');
    const t2 = out.recommendations.find((r) => r.restaurant_tenant_id === 't2');
    expect(t1?.fleet_id).toBe('f1');
    expect(t2?.fleet_id).toBe('f1');
    expect(t2!.projected_utilization!).toBeGreaterThan(t1!.projected_utilization!);
  });

  it('respects custom config thresholds', () => {
    // Capacity 20, demand 60 → util 3.0. Default band [3,5] → in-band.
    // With band [4,5] → below band → above_band_acceptable fallback.
    const fleets = [makeFleet({ courier_count_active: 5, target_orders_per_hour: 4 })];
    const restaurants = [makeRestaurant({ estimated_peak_demand: 60 })];

    const out = recommendAllocations({
      fleets,
      restaurants,
      config: { utilization_floor: 4, utilization_ceiling: 5, utilization_hard_cap: 7 },
    });
    // Util 3.0 is below floor 4, but the algorithm only treats above-ceiling
    // as the fallback path. Below-floor IS still acceptable (under-utilized
    // = fleet on minus, but algorithm prefers placement to no_capacity).
    // Sorting puts under-band fleets last; but with one fleet it still picks.
    expect(out.recommendations[0].fleet_id).toBe('fleet-default');
    // Reason is 'assigned_above_band_acceptable' because the in-band check failed
    // (3.0 < floor 4). This is a known V1 quirk — under-utilization doesn't
    // get a distinct reason code yet.
    expect(out.recommendations[0].reason).toBe('assigned_above_band_acceptable');
  });

  it('preserves original input order for restaurants with identical demand', () => {
    const fleets = [makeFleet({ fleet_id: 'f1', courier_count_active: 10, target_orders_per_hour: 4 })];
    const restaurants = [
      makeRestaurant({ restaurant_tenant_id: 'first', estimated_peak_demand: 30 }),
      makeRestaurant({ restaurant_tenant_id: 'second', estimated_peak_demand: 30 }),
      makeRestaurant({ restaurant_tenant_id: 'third', estimated_peak_demand: 30 }),
    ];

    const out = recommendAllocations({ fleets, restaurants });
    // After processing in same order: util 30/40=0.75, 60/40=1.5, 90/40=2.25.
    // Last one has highest util.
    const order = out.recommendations.map((r) => r.restaurant_tenant_id);
    expect(order).toEqual(['first', 'second', 'third']);
    expect(out.recommendations[2].projected_utilization).toBe(2.25);
  });

  it('treats external-app fleets as eligible candidates (capacity math is identical)', () => {
    const fleets = [
      makeFleet({ fleet_id: 'ext', delivery_app: 'external', courier_count_active: 5, target_orders_per_hour: 4 }),
    ];
    const restaurants = [makeRestaurant({ estimated_peak_demand: 80 })];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations[0].fleet_id).toBe('ext');
    expect(out.recommendations[0].reason).toBe('assigned_within_band');
  });

  it('returns deterministic output across runs (same input → same output)', () => {
    const fleets = [
      makeFleet({ fleet_id: 'f1', courier_count_active: 5, target_orders_per_hour: 4 }),
      makeFleet({ fleet_id: 'f2', courier_count_active: 7, target_orders_per_hour: 4 }),
    ];
    const restaurants = [
      makeRestaurant({ restaurant_tenant_id: 't1', estimated_peak_demand: 60 }),
      makeRestaurant({ restaurant_tenant_id: 't2', estimated_peak_demand: 40 }),
      makeRestaurant({ restaurant_tenant_id: 't3', estimated_peak_demand: 30 }),
    ];

    const a = recommendAllocations({ fleets, restaurants });
    const b = recommendAllocations({ fleets, restaurants });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('aggregates multiple uncovered cities without duplicates', () => {
    const fleets = [makeFleet({ city_id: CITY_BV })];
    const restaurants = [
      makeRestaurant({ restaurant_tenant_id: 't-buc1', city_id: CITY_BUC, estimated_peak_demand: 50 }),
      makeRestaurant({ restaurant_tenant_id: 't-buc2', city_id: CITY_BUC, estimated_peak_demand: 30 }),
    ];

    const out = recommendAllocations({ fleets, restaurants });
    expect(out.uncovered_city_ids).toEqual([CITY_BUC]);
  });
});
