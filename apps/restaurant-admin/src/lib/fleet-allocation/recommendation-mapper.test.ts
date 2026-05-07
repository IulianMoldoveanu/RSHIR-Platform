import { describe, it, expect } from 'vitest';
import { buildAlgorithmInputs, type GridSnapshot } from './recommendation-mapper';
import { recommendAllocations } from './algorithm';
import type { AssignmentRow, FleetRow, RestaurantRow } from './queries';

const CITY_BV = 'aaaaaaaa-0000-0000-0000-000000000001';
const CITY_BUC = 'aaaaaaaa-0000-0000-0000-000000000002';

function fleet(overrides: Partial<FleetRow> = {}): FleetRow {
  return {
    id: overrides.id ?? 'f1',
    name: overrides.name ?? 'Fleet 1',
    slug: overrides.slug ?? 'fleet-1',
    delivery_app: overrides.delivery_app ?? 'hir',
    is_active: overrides.is_active ?? true,
    active_courier_count: overrides.active_courier_count ?? 5,
    target_orders_per_hour: overrides.target_orders_per_hour ?? 4,
  };
}

function restaurant(overrides: Partial<RestaurantRow> = {}): RestaurantRow {
  return {
    id: overrides.id ?? 'r1',
    name: overrides.name ?? 'Restaurant 1',
    slug: overrides.slug ?? 'restaurant-1',
    city_id: 'city_id' in overrides ? overrides.city_id! : CITY_BV,
    city_name: overrides.city_name ?? 'Brașov',
  };
}

function assignment(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id: overrides.id ?? 'a1',
    fleet_id: overrides.fleet_id ?? 'f1',
    restaurant_tenant_id: overrides.restaurant_tenant_id ?? 'r1',
    role: overrides.role ?? 'primary',
    status: overrides.status ?? 'active',
    assigned_at: overrides.assigned_at ?? '2026-05-01T00:00:00Z',
    notes: overrides.notes ?? null,
  };
}

describe('buildAlgorithmInputs', () => {
  it('distributes city demand uniformly across restaurants in the city', () => {
    const grid: GridSnapshot = {
      fleets: [fleet()],
      restaurants: [
        restaurant({ id: 'r1' }),
        restaurant({ id: 'r2' }),
        restaurant({ id: 'r3' }),
      ],
      assignments: [],
    };
    const demand = new Map<string, number>([[CITY_BV, 30]]);

    const inputs = buildAlgorithmInputs(grid, demand);
    const peaks = inputs.restaurants.map((r) => r.estimated_peak_demand).sort();
    expect(peaks).toEqual([10, 10, 10]);
  });

  it('zeroes demand for restaurants without a city', () => {
    const grid: GridSnapshot = {
      fleets: [fleet()],
      restaurants: [restaurant({ id: 'r1', city_id: null })],
      assignments: [],
    };
    const demand = new Map<string, number>([[CITY_BV, 30]]);

    const inputs = buildAlgorithmInputs(grid, demand);
    expect(inputs.restaurants[0].estimated_peak_demand).toBe(0);
  });

  it('sums fleet current_assigned_demand only over ACTIVE PRIMARY rows', () => {
    const grid: GridSnapshot = {
      fleets: [fleet({ id: 'f1' })],
      restaurants: [
        restaurant({ id: 'r1' }),
        restaurant({ id: 'r2' }),
        restaurant({ id: 'r3' }),
      ],
      assignments: [
        assignment({ fleet_id: 'f1', restaurant_tenant_id: 'r1', role: 'primary', status: 'active' }),
        // Secondary should NOT count toward current load.
        assignment({ id: 'a2', fleet_id: 'f1', restaurant_tenant_id: 'r2', role: 'secondary', status: 'active' }),
        // Terminated primary should NOT count.
        assignment({ id: 'a3', fleet_id: 'f1', restaurant_tenant_id: 'r3', role: 'primary', status: 'terminated' }),
      ],
    };
    const demand = new Map<string, number>([[CITY_BV, 30]]);

    const inputs = buildAlgorithmInputs(grid, demand);
    // 30 / 3 = 10 each; only r1 (primary active) counts toward fleet load.
    expect(inputs.fleets[0].current_assigned_demand).toBe(10);
  });

  it('infers fleet city as the mode of its active-primary restaurants', () => {
    const grid: GridSnapshot = {
      fleets: [fleet({ id: 'f1' })],
      restaurants: [
        restaurant({ id: 'r1', city_id: CITY_BV }),
        restaurant({ id: 'r2', city_id: CITY_BV }),
        restaurant({ id: 'r3', city_id: CITY_BUC }),
      ],
      assignments: [
        assignment({ id: 'a1', fleet_id: 'f1', restaurant_tenant_id: 'r1', role: 'primary', status: 'active' }),
        assignment({ id: 'a2', fleet_id: 'f1', restaurant_tenant_id: 'r2', role: 'primary', status: 'active' }),
        assignment({ id: 'a3', fleet_id: 'f1', restaurant_tenant_id: 'r3', role: 'primary', status: 'active' }),
      ],
    };
    const inputs = buildAlgorithmInputs(grid, new Map());
    // 2 BV vs 1 BUC -> BV wins.
    expect(inputs.fleets[0].city_id).toBe(CITY_BV);
  });

  it('leaves fleet city null when fleet has no active assignments', () => {
    const grid: GridSnapshot = {
      fleets: [fleet({ id: 'f1' })],
      restaurants: [restaurant({ id: 'r1' })],
      assignments: [],
    };
    const inputs = buildAlgorithmInputs(grid, new Map());
    expect(inputs.fleets[0].city_id).toBeNull();
  });

  it('end-to-end: produces in-band recommendations when capacity matches demand', () => {
    const grid: GridSnapshot = {
      fleets: [
        fleet({ id: 'f1', active_courier_count: 5, target_orders_per_hour: 4 }),
        // capacity = 20; in-band [3,5] → demand 60..100 ideally
      ],
      restaurants: [
        restaurant({ id: 'r1' }),
        restaurant({ id: 'r2' }),
      ],
      assignments: [],
    };
    // City demand 80, split 40/40 across 2 restaurants → first gets primary
    // (40 / 20 = 2.0 — BELOW band; second would also be 2.0). Algorithm should
    // still allocate as fallback (acceptable since under hard cap 7).
    const demand = new Map<string, number>([[CITY_BV, 80]]);
    const { fleets, restaurants } = buildAlgorithmInputs(grid, demand);

    expect(fleets[0].current_assigned_demand).toBe(0);
    expect(restaurants[0].estimated_peak_demand).toBe(40);

    // Smoke through the algorithm to assert the shape pipes cleanly.
    const out = recommendAllocations({ fleets, restaurants });
    expect(out.recommendations).toHaveLength(2);
    // First restaurant gets 40/20 = 2.0 utilization (below 3 floor → fallback).
    expect(out.recommendations[0].fleet_id).toBe('f1');
  });

  it('flags needs_new_fleet when no fleet covers a city with demand', () => {
    const grid: GridSnapshot = {
      fleets: [], // zero fleets, but a city with demand
      restaurants: [restaurant({ id: 'r1', city_id: CITY_BV })],
      assignments: [],
    };
    const demand = new Map<string, number>([[CITY_BV, 50]]);
    const { fleets, restaurants } = buildAlgorithmInputs(grid, demand);
    const out = recommendAllocations({ fleets, restaurants });

    expect(out.needs_new_fleet).toBe(true);
    expect(out.uncovered_city_ids).toContain(CITY_BV);
  });

  it('does not crash on duplicate active primaries (defensive)', () => {
    // Schema's partial-unique index prevents this in production, but the
    // mapper must not blow up if the DB ever drifts into an inconsistent
    // state (e.g. a manual SQL patch).
    const grid: GridSnapshot = {
      fleets: [fleet({ id: 'f1' })],
      restaurants: [restaurant({ id: 'r1' })],
      assignments: [
        assignment({ id: 'a1', fleet_id: 'f1', restaurant_tenant_id: 'r1', role: 'primary', status: 'active' }),
        assignment({ id: 'a2', fleet_id: 'f1', restaurant_tenant_id: 'r1', role: 'primary', status: 'active' }),
      ],
    };
    expect(() => buildAlgorithmInputs(grid, new Map())).not.toThrow();
  });
});
