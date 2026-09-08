import { describe, it, expect } from 'vitest';
import { findCoverageGaps } from './coverage';
import type { AssignmentRow, FleetRow, RestaurantRow } from './queries';

const fleet = (over: Partial<FleetRow> & { id: string; name: string }): FleetRow => ({
  slug: over.id,
  delivery_app: 'hir',
  is_active: true,
  tier: 'partner',
  primary_city_id: null,
  active_courier_count: 0,
  target_orders_per_hour: 4,
  ...over,
});

const vendor = (over: Partial<RestaurantRow> & { id: string; name: string }): RestaurantRow => ({
  slug: over.id,
  city_id: 'buc',
  city_name: 'București',
  status: 'ACTIVE',
  external_dispatch_enabled: false,
  ...over,
});

const assign = (
  fleet_id: string,
  restaurant_tenant_id: string,
  over: Partial<AssignmentRow> = {},
): AssignmentRow => ({
  id: `${fleet_id}-${restaurant_tenant_id}`,
  fleet_id,
  restaurant_tenant_id,
  role: 'primary',
  status: 'active',
  assigned_at: '2026-08-01T00:00:00Z',
  notes: null,
  recent_strike_count: 0,
  ...over,
});

describe('findCoverageGaps', () => {
  it('is quiet when an assigned fleet has riders', () => {
    expect(
      findCoverageGaps({
        fleets: [fleet({ id: 'f1', name: 'Nord', active_courier_count: 5 })],
        restaurants: [vendor({ id: 't1', name: 'Pizzeria' })],
        assignments: [assign('f1', 't1')],
      }),
    ).toEqual([]);
  });

  it('flags a vendor whose only fleet has no couriers', () => {
    const gaps = findCoverageGaps({
      fleets: [fleet({ id: 'f1', name: 'Nord', active_courier_count: 0 })],
      restaurants: [vendor({ id: 't1', name: 'Pizzeria' })],
      assignments: [assign('f1', 't1')],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      tenantId: 't1',
      reason: 'assigned_fleet_has_no_couriers',
      fleetName: 'Nord',
    });
  });

  // The trigger takes `order by assigned_at desc limit 1` and stops. It never
  // tries the secondary, so a staffed secondary is NOT cover when the newest
  // assignment points at an empty fleet.
  it('still flags when the newest assignment is unstaffed, even with a staffed secondary', () => {
    const gaps = findCoverageGaps({
      fleets: [
        fleet({ id: 'f1', name: 'Nord', active_courier_count: 0 }),
        fleet({ id: 'f2', name: 'Sud', active_courier_count: 3 }),
      ],
      restaurants: [vendor({ id: 't1', name: 'Pizzeria' })],
      assignments: [
        assign('f2', 't1', { role: 'secondary', assigned_at: '2026-07-01T00:00:00Z' }),
        assign('f1', 't1', { assigned_at: '2026-08-01T00:00:00Z' }), // newer, empty
      ],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ reason: 'assigned_fleet_has_no_couriers', fleetName: 'Nord' });
  });

  it('is quiet when the newest assignment is the staffed one', () => {
    expect(
      findCoverageGaps({
        fleets: [
          fleet({ id: 'f1', name: 'Nord', active_courier_count: 0 }),
          fleet({ id: 'f2', name: 'Sud', active_courier_count: 3 }),
        ],
        restaurants: [vendor({ id: 't1', name: 'Pizzeria' })],
        assignments: [
          assign('f1', 't1', { assigned_at: '2026-07-01T00:00:00Z' }),
          assign('f2', 't1', { role: 'secondary', assigned_at: '2026-08-01T00:00:00Z' }),
        ],
      }),
    ).toEqual([]);
  });

  // This is the exact case the load test hit: vendor 20 fell back to an
  // owner-tier fleet with zero riders and its order was never offered.
  it('flags an unassigned vendor when the owner fallback has no riders', () => {
    const gaps = findCoverageGaps({
      fleets: [
        fleet({ id: 'owner', name: 'HIR Default Fleet', tier: 'owner', active_courier_count: 0 }),
        fleet({ id: 'f1', name: 'Nord', active_courier_count: 9 }),
      ],
      restaurants: [vendor({ id: 't1', name: 'Vendor nou' })],
      assignments: [],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      reason: 'no_fleet_assigned',
      fleetName: 'HIR Default Fleet',
    });
  });

  // 20260909_001: the trigger now prefers a staffed fleet in the vendor's own
  // city over the owner-tier fallback. Bucharest is the case that made this
  // matter — the only owner fleet has no city and no riders, while the only
  // real Bucharest fleet was never considered.
  it('is quiet when a staffed fleet in the same city can take it', () => {
    expect(
      findCoverageGaps({
        fleets: [
          fleet({ id: 'owner', name: 'HIR Default Fleet', tier: 'owner', active_courier_count: 0 }),
          fleet({ id: 'els', name: 'Els', primary_city_id: 'buc', active_courier_count: 1 }),
        ],
        restaurants: [vendor({ id: 't1', name: 'Vendor nou', city_id: 'buc' })],
        assignments: [],
      }),
    ).toEqual([]);
  });

  it('still flags the vendor when the staffed fleet is in another city', () => {
    const gaps = findCoverageGaps({
      fleets: [
        fleet({ id: 'owner', name: 'HIR Default Fleet', tier: 'owner', active_courier_count: 0 }),
        fleet({ id: 'bv', name: 'Brasov', primary_city_id: 'bv', active_courier_count: 4 }),
      ],
      restaurants: [vendor({ id: 't1', name: 'Vendor nou', city_id: 'buc' })],
      assignments: [],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ reason: 'no_fleet_assigned' });
  });

  it('does not let a cityless vendor borrow a city fleet', () => {
    const gaps = findCoverageGaps({
      fleets: [
        fleet({ id: 'owner', name: 'HIR Default Fleet', tier: 'owner', active_courier_count: 0 }),
        fleet({ id: 'els', name: 'Els', primary_city_id: 'buc', active_courier_count: 1 }),
      ],
      restaurants: [vendor({ id: 't1', name: 'Fara oras', city_id: null })],
      assignments: [],
    });
    expect(gaps).toHaveLength(1);
  });

  it('is quiet for an unassigned vendor when a staffed owner fleet exists', () => {
    expect(
      findCoverageGaps({
        fleets: [fleet({ id: 'owner', name: 'HIR', tier: 'owner', active_courier_count: 4 })],
        restaurants: [vendor({ id: 't1', name: 'Vendor nou' })],
        assignments: [],
      }),
    ).toEqual([]);
  });

  it('ignores vendors that are not live, and ones dispatching externally', () => {
    expect(
      findCoverageGaps({
        fleets: [],
        restaurants: [
          vendor({ id: 't1', name: 'Draft', status: 'PENDING' }),
          vendor({ id: 't2', name: 'Glovo-only', external_dispatch_enabled: true }),
        ],
        assignments: [],
      }),
    ).toEqual([]);
  });

  it('ignores paused and terminated assignments, and inactive fleets', () => {
    const gaps = findCoverageGaps({
      fleets: [
        fleet({ id: 'f1', name: 'Nord', active_courier_count: 9, is_active: false }),
        fleet({ id: 'f2', name: 'Sud', active_courier_count: 9 }),
      ],
      restaurants: [vendor({ id: 't1', name: 'Pizzeria' })],
      assignments: [
        assign('f1', 't1'), // staffed but the fleet is switched off
        assign('f2', 't1', { status: 'paused' }), // staffed but paused
      ],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].reason).toBe('no_fleet_assigned');
  });
});
