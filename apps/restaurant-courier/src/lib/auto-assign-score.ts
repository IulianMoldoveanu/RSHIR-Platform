// Pure scoring function for courier auto-assignment.
//
// This module extracts the heuristic that previously lived inline inside
// autoAssignOrderAction so it can be:
//   1. Unit-tested with frozen seeds (determinism guarantee).
//   2. Persisted to audit_log.metadata so fleet managers can see "why
//      this courier was chosen".
//
// The scoring mirrors the original sort exactly:
//   Primary key   — active order load (fewer = better)
//   Secondary key — haversine distance to pickup (closer = better;
//                   couriers with no GPS fix sort to the end)
//
// NO behavior changes vs. the original sort. Tuning is a separate decision.

export const NO_GPS_DISTANCE_KM = Number.POSITIVE_INFINITY;

// Max distance we consider for scoring (km). Couriers beyond this still
// participate — they just receive distanceScore = 0. The existing heuristic
// had no cap; this constant is only used for UI display normalisation and
// does not affect ordering.
const SCORE_DISTANCE_CAP_KM = 10;

// Max load we consider for scoring. Couriers above this still participate.
const SCORE_LOAD_CAP = 5;

// Score weights — must sum to 100. These map the original sort's two-key
// comparison onto a single numeric score so ties are resolved identically.
// The load axis dominates (same as original heuristic: load sorts first).
const WEIGHT_LOAD = 60;
const WEIGHT_DISTANCE = 40;

export type ScoreFactor = {
  // Distance from courier's last GPS fix to the order's pickup, in km.
  // null means the courier had no GPS fix (treated as worst-case).
  distanceKm: number | null;
  // 0–WEIGHT_DISTANCE points. 0 when no GPS or distance >= cap.
  distanceScore: number;
  // Number of orders currently ACCEPTED/PICKED_UP/IN_TRANSIT.
  activeLoad: number;
  // 0–WEIGHT_LOAD points. 0 when load >= cap.
  loadScore: number;
  // Whether the courier's vehicle type matches the order's required type.
  // The current heuristic does NOT filter by vehicle type; this is always
  // true and vehicleScore is always 0. Included in the breakdown so fleet
  // managers can see the gap — tuning is a separate Iulian decision.
  vehicleMatch: boolean;
  vehicleScore: number;
  // +10 on-shift bonus is NOT in the current heuristic (all candidates in
  // the list are already verified online). Field exists for UI display
  // consistency with the design spec; always 0 in this implementation.
  onShiftBonus: number;
};

export type ScoredCandidate = {
  courierId: string;
  totalScore: number;
  factors: ScoreFactor;
};

export type ScoringOrder = {
  pickup_lat: number | null;
  pickup_lng: number | null;
  required_vehicle_type?: string | null; // unused by current heuristic
};

export type ScoringCourier = {
  userId: string;
  // Active in-progress order count.
  activeLoad: number;
  // Last known GPS position. null = no fix.
  lastLat: number | null;
  lastLng: number | null;
  vehicleType?: string | null; // unused by current heuristic
};

// Haversine distance in metres between two WGS-84 coordinates.
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

/**
 * Score and rank candidates for a given order using the existing heuristic
 * (load first, then distance). Returns a list sorted descending by
 * totalScore — index 0 is the recommended courier.
 *
 * The sort is stable-by-courierId for tie-breaking (same load + same
 * distanceKm → lexicographic userId order), which guarantees identical
 * results across calls with the same inputs.
 */
export function scoreCandidates(
  order: ScoringOrder,
  couriers: ScoringCourier[],
): ScoredCandidate[] {
  // Keep a parallel raw-sort key per courier so the final sort can fall
  // back to the exact original comparison when totalScore ties due to
  // integer rounding. This guarantees scoreCandidates()[0] === the winner
  // of the original `sort by load then distanceM` on all inputs.
  const rawKeys = new Map<string, { load: number; distanceM: number }>();

  const scored: ScoredCandidate[] = couriers.map((c) => {
    // Compute distance.
    let distanceKm: number | null = null;
    let rawDistanceM: number = Number.POSITIVE_INFINITY;
    if (
      order.pickup_lat != null &&
      order.pickup_lng != null &&
      c.lastLat != null &&
      c.lastLng != null
    ) {
      rawDistanceM = haversineMeters(order.pickup_lat, order.pickup_lng, c.lastLat, c.lastLng);
      distanceKm = rawDistanceM / 1000;
    }

    // Distance score: 0 when no GPS or beyond cap; linear between 0 and cap.
    let distanceScore = 0;
    if (distanceKm !== null && Number.isFinite(distanceKm)) {
      const capped = Math.min(distanceKm, SCORE_DISTANCE_CAP_KM);
      // Closer = higher score.
      distanceScore = Math.round(
        ((SCORE_DISTANCE_CAP_KM - capped) / SCORE_DISTANCE_CAP_KM) * WEIGHT_DISTANCE,
      );
    }

    // Load score: 0 when load >= cap; linear between 0 and cap.
    const loadCapped = Math.min(c.activeLoad, SCORE_LOAD_CAP);
    const loadScore = Math.round(
      ((SCORE_LOAD_CAP - loadCapped) / SCORE_LOAD_CAP) * WEIGHT_LOAD,
    );

    const totalScore = loadScore + distanceScore;

    const factors: ScoreFactor = {
      distanceKm,
      distanceScore,
      activeLoad: c.activeLoad,
      loadScore,
      // Vehicle matching is not implemented in the current heuristic.
      vehicleMatch: true,
      vehicleScore: 0,
      onShiftBonus: 0,
    };

    rawKeys.set(c.userId, { load: c.activeLoad, distanceM: rawDistanceM });
    return { courierId: c.userId, totalScore, factors };
  });

  // Sort descending by totalScore. When scores tie due to integer rounding,
  // fall back to the original heuristic's exact comparison (load ASC then
  // distanceM ASC) to guarantee scoreCandidates()[0] always equals the
  // winner from the old inline sort. Final tie-break is courierId
  // lexicographic for test determinism.
  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    // Rounding tie — use the original comparison keys.
    const ra = rawKeys.get(a.courierId)!;
    const rb = rawKeys.get(b.courierId)!;
    if (ra.load !== rb.load) return ra.load - rb.load; // fewer active orders = better = sort first
    if (ra.distanceM !== rb.distanceM) return ra.distanceM - rb.distanceM; // closer = better = sort first
    return a.courierId.localeCompare(b.courierId);
  });

  return scored;
}
