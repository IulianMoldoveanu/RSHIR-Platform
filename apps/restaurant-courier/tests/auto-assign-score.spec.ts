import { describe, it, expect } from 'vitest';
import {
  scoreCandidates,
  NO_GPS_DISTANCE_KM,
  type ScoringOrder,
  type ScoringCourier,
} from '../src/lib/auto-assign-score';

// ---------------------------------------------------------------------------
// Reference implementation of the original inline heuristic from actions.ts.
// Used in the invariant tests to verify scoreCandidates() picks the same
// winner under the same inputs.
// ---------------------------------------------------------------------------

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Exact copy of the old inline sort logic from autoAssignOrderAction. */
function originalHeuristicWinner(
  order: ScoringOrder,
  couriers: ScoringCourier[],
): string | null {
  type Candidate = { userId: string; load: number; distanceM: number };
  const NO_GPS = Number.POSITIVE_INFINITY;
  const candidates: Candidate[] = couriers.map((c) => {
    const distance =
      order.pickup_lat != null &&
      order.pickup_lng != null &&
      c.lastLat != null &&
      c.lastLng != null
        ? haversineMeters(order.pickup_lat, order.pickup_lng, c.lastLat, c.lastLng)
        : NO_GPS;
    return { userId: c.userId, load: c.activeLoad, distanceM: distance };
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.load !== b.load) return a.load - b.load;
    return a.distanceM - b.distanceM;
  });
  return candidates[0].userId;
}

// ---------------------------------------------------------------------------
// Test data helpers — fixed coordinates around Brașov, Romania.
// ---------------------------------------------------------------------------

const PICKUP: ScoringOrder = { pickup_lat: 45.6427, pickup_lng: 25.5887 };

// Courier positions: ~300 m, ~1.5 km, ~5 km from pickup.
const COURIER_NEAR: ScoringCourier = {
  userId: 'courier-near',
  activeLoad: 0,
  lastLat: 45.6400,
  lastLng: 25.5887,
};
const COURIER_MID: ScoringCourier = {
  userId: 'courier-mid',
  activeLoad: 0,
  lastLat: 45.6300,
  lastLng: 25.5887,
};
const COURIER_FAR: ScoringCourier = {
  userId: 'courier-far',
  activeLoad: 0,
  lastLat: 45.5977,
  lastLng: 25.5887,
};
const COURIER_NO_GPS: ScoringCourier = {
  userId: 'courier-no-gps',
  activeLoad: 0,
  lastLat: null,
  lastLng: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scoreCandidates — basic output shape', () => {
  it('returns one entry per courier in descending score order', () => {
    const result = scoreCandidates(PICKUP, [COURIER_FAR, COURIER_NEAR, COURIER_MID]);
    expect(result).toHaveLength(3);
    // Scores should be non-increasing.
    for (let i = 1; i < result.length; i++) {
      expect(result[i].totalScore).toBeLessThanOrEqual(result[i - 1].totalScore);
    }
  });

  it('every entry has all required factor keys', () => {
    const [first] = scoreCandidates(PICKUP, [COURIER_NEAR]);
    expect(first).toHaveProperty('courierId');
    expect(first).toHaveProperty('totalScore');
    expect(first.factors).toMatchObject({
      distanceKm: expect.any(Number),
      distanceScore: expect.any(Number),
      activeLoad: expect.any(Number),
      loadScore: expect.any(Number),
      vehicleMatch: true,
      vehicleScore: 0,
      onShiftBonus: 0,
    });
  });

  it('courierId matches userId from input', () => {
    const result = scoreCandidates(PICKUP, [COURIER_NEAR]);
    expect(result[0].courierId).toBe('courier-near');
  });
});

describe('scoreCandidates — load dominates distance', () => {
  it('idle courier (load=0) beats busy courier (load=2) even when closer', () => {
    const busy: ScoringCourier = { ...COURIER_NEAR, userId: 'busy', activeLoad: 2 };
    const idle: ScoringCourier = { ...COURIER_FAR, userId: 'idle', activeLoad: 0 };
    const result = scoreCandidates(PICKUP, [busy, idle]);
    expect(result[0].courierId).toBe('idle');
  });

  it('among same-load couriers, closest wins', () => {
    const result = scoreCandidates(PICKUP, [COURIER_FAR, COURIER_MID, COURIER_NEAR]);
    expect(result[0].courierId).toBe('courier-near');
  });
});

describe('scoreCandidates — GPS handling', () => {
  it('courier with no GPS fix gets null distanceKm and distanceScore 0', () => {
    const [first] = scoreCandidates(PICKUP, [COURIER_NO_GPS]);
    expect(first.factors.distanceKm).toBeNull();
    expect(first.factors.distanceScore).toBe(0);
  });

  it('courier with GPS fix beats courier with no GPS at same load', () => {
    const result = scoreCandidates(PICKUP, [COURIER_NO_GPS, COURIER_FAR]);
    expect(result[0].courierId).toBe('courier-far');
  });

  it(`distanceKm is null when no fix (constant NO_GPS_DISTANCE_KM = ${NO_GPS_DISTANCE_KM})`, () => {
    const [r] = scoreCandidates(PICKUP, [COURIER_NO_GPS]);
    expect(r.factors.distanceKm).toBeNull();
  });
});

describe('scoreCandidates — score weight check', () => {
  it('loadScore + distanceScore + vehicleScore + onShiftBonus equals totalScore', () => {
    const couriers = [COURIER_NEAR, COURIER_MID, COURIER_FAR, COURIER_NO_GPS];
    const result = scoreCandidates(PICKUP, couriers);
    for (const r of result) {
      const computed =
        r.factors.loadScore +
        r.factors.distanceScore +
        r.factors.vehicleScore +
        r.factors.onShiftBonus;
      expect(r.totalScore).toBe(computed);
    }
  });
});

describe('scoreCandidates — determinism (frozen-seed)', () => {
  it('same inputs always produce same output', () => {
    const couriers = [COURIER_NEAR, COURIER_MID, COURIER_FAR, COURIER_NO_GPS];
    const r1 = scoreCandidates(PICKUP, couriers);
    const r2 = scoreCandidates(PICKUP, couriers);
    expect(r1.map((c) => c.courierId)).toEqual(r2.map((c) => c.courierId));
  });

  it('input order does not change the winner', () => {
    const couriers = [COURIER_FAR, COURIER_NEAR, COURIER_MID];
    const r1 = scoreCandidates(PICKUP, [...couriers]);
    const r2 = scoreCandidates(PICKUP, [...couriers].reverse());
    expect(r1[0].courierId).toBe(r2[0].courierId);
  });
});

// ---------------------------------------------------------------------------
// INVARIANT TESTS: scoreCandidates()[0] must equal originalHeuristicWinner()
// on at least 3 seeded scenarios.
// ---------------------------------------------------------------------------

describe('scoreCandidates — invariant: same winner as original heuristic', () => {
  /**
   * Scenario 1: Three couriers at different distances, all idle.
   * Original winner = closest (courier-near).
   */
  it('scenario 1: all idle, pick closest', () => {
    const order: ScoringOrder = PICKUP;
    const couriers: ScoringCourier[] = [COURIER_FAR, COURIER_NEAR, COURIER_MID];

    const original = originalHeuristicWinner(order, couriers);
    const [newWinner] = scoreCandidates(order, couriers);

    expect(original).toBe('courier-near');
    expect(newWinner.courierId).toBe(original);
  });

  /**
   * Scenario 2: Closest courier is busy (load=3), two idle couriers further away.
   * Original winner = less-busy mid courier, not the closest.
   */
  it('scenario 2: busy closest courier — idle mid wins', () => {
    const order: ScoringOrder = PICKUP;
    const couriers: ScoringCourier[] = [
      { ...COURIER_NEAR, userId: 'near-busy', activeLoad: 3 },
      { ...COURIER_MID, userId: 'mid-idle', activeLoad: 0 },
      { ...COURIER_FAR, userId: 'far-idle', activeLoad: 0 },
    ];

    const original = originalHeuristicWinner(order, couriers);
    const [newWinner] = scoreCandidates(order, couriers);

    expect(original).toBe('mid-idle');
    expect(newWinner.courierId).toBe(original);
  });

  /**
   * Scenario 3: One courier has no GPS, one is nearby.
   * Original winner = the courier with a GPS fix (even if far).
   */
  it('scenario 3: no-GPS courier vs. GPS courier — GPS wins', () => {
    const order: ScoringOrder = PICKUP;
    const couriers: ScoringCourier[] = [
      { ...COURIER_NO_GPS, userId: 'no-gps-idle', activeLoad: 0 },
      { ...COURIER_FAR, userId: 'far-idle', activeLoad: 0 },
    ];

    const original = originalHeuristicWinner(order, couriers);
    const [newWinner] = scoreCandidates(order, couriers);

    expect(original).toBe('far-idle');
    expect(newWinner.courierId).toBe(original);
  });

  /**
   * Scenario 4 (bonus): Order has no pickup coordinates — all couriers
   * are equivalent (no-GPS). Tie broken by the original sort's stability
   * (consistent array index 0), and by our courierId lexicographic fallback.
   */
  it('scenario 4: order has no pickup coords — tie broken stably', () => {
    const order: ScoringOrder = { pickup_lat: null, pickup_lng: null };
    const couriers: ScoringCourier[] = [
      { userId: 'aaa', activeLoad: 1, lastLat: null, lastLng: null },
      { userId: 'bbb', activeLoad: 1, lastLat: null, lastLng: null },
      { userId: 'ccc', activeLoad: 0, lastLat: null, lastLng: null },
    ];

    // Original sort: by load then distanceM (all Infinity → stable by input order).
    // 'ccc' has load=0, wins regardless of input order.
    const original = originalHeuristicWinner(order, couriers);
    const [newWinner] = scoreCandidates(order, couriers);

    expect(original).toBe('ccc');
    expect(newWinner.courierId).toBe(original);
  });
});
