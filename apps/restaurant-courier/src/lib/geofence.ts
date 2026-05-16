/**
 * Client-side geofence state machine for the courier delivery flow.
 *
 * Tracks proximity to pickup and dropoff coordinates and produces
 * alert events when the courier enters or leaves each zone.
 *
 * ZONES
 * -----
 * NEAR_PICKUP   — within 100m of pickup_lat/lng (only relevant in ACCEPTED)
 * NEAR_DROPOFF  — within 100m of dropoff_lat/lng (only relevant in PICKED_UP)
 * LEFT_PICKUP_WITHOUT_MARK — was inside pickup zone for ≥2min, then moved
 *   >200m away without having been marked PICKED_UP (ACCEPTED phase only)
 *
 * DEDUP
 * -----
 * Each alert type is stored in localStorage with a timestamp. An alert
 * is suppressed if the same key fired within the last 30 minutes. This
 * prevents re-firing when the courier oscillates just around the boundary.
 *
 * HAVERSINE
 * ---------
 * Same formula as server-side assertDeliveryGeofence in actions.ts.
 * Kept local so this file has zero server-only imports.
 */

export type GeofenceAlertType =
  | 'NEAR_PICKUP'
  | 'NEAR_DROPOFF'
  | 'LEFT_PICKUP_WITHOUT_MARK';

export type GeofenceCoords = {
  lat: number;
  lng: number;
};

const NEAR_THRESHOLD_M = 100;
const LEFT_THRESHOLD_M = 200;
const MIN_DWELL_MS = 2 * 60 * 1_000; // 2 minutes
const DEDUP_WINDOW_MS = 30 * 60 * 1_000; // 30 minutes

/** Haversine great-circle distance in metres. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dedupKey(orderId: string, alert: GeofenceAlertType): string {
  return `hir:geo:${orderId}:${alert}`;
}

/** Returns true if this alert was already fired within the dedup window. */
export function wasRecentlyFired(orderId: string, alert: GeofenceAlertType): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(dedupKey(orderId, alert));
    if (!raw) return false;
    return Date.now() - Number(raw) < DEDUP_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Mark an alert as fired now (for dedup). */
export function markFired(orderId: string, alert: GeofenceAlertType): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(dedupKey(orderId, alert), String(Date.now()));
  } catch {
    // localStorage unavailable (quota / private mode) — skip.
  }
}

/**
 * Stateful geofence evaluator. Create one instance per order detail view.
 * Dwell-state (pickupEnteredAt) lives across evaluate() calls so the
 * LEFT_PICKUP_WITHOUT_MARK logic spans multiple GPS fixes correctly.
 *
 * `evaluate(lat, lng, orderStatus)` returns a `GeofenceAlertType` when an
 * alert should fire (before dedup), or `null` for routine fixes.
 */
export class GeofenceEvaluator {
  private readonly pickup: GeofenceCoords;
  private readonly dropoff: GeofenceCoords;

  private pickupEnteredAt: number | null = null;
  private insidePickup = false;

  constructor(pickup: GeofenceCoords, dropoff: GeofenceCoords) {
    this.pickup = pickup;
    this.dropoff = dropoff;
  }

  /**
   * Evaluate a new GPS fix given the current order status.
   * Returns the alert to consider, or null. Caller must run dedup.
   */
  evaluate(lat: number, lng: number, orderStatus: string): GeofenceAlertType | null {
    const distPickup = haversineMeters(lat, lng, this.pickup.lat, this.pickup.lng);
    const distDropoff = haversineMeters(lat, lng, this.dropoff.lat, this.dropoff.lng);

    // NEAR_DROPOFF — only during PICKED_UP phase.
    if (orderStatus === 'PICKED_UP' && distDropoff <= NEAR_THRESHOLD_M) {
      return 'NEAR_DROPOFF';
    }

    // NEAR_PICKUP + LEFT_PICKUP_WITHOUT_MARK — only during ACCEPTED phase.
    if (orderStatus === 'ACCEPTED') {
      if (distPickup <= NEAR_THRESHOLD_M) {
        if (!this.insidePickup) {
          this.insidePickup = true;
          this.pickupEnteredAt = Date.now();
        }
        return 'NEAR_PICKUP';
      }

      // Outside pickup zone.
      if (this.insidePickup) {
        const dwell = this.pickupEnteredAt ? Date.now() - this.pickupEnteredAt : 0;
        this.insidePickup = false;
        this.pickupEnteredAt = null;
        if (dwell >= MIN_DWELL_MS && distPickup > LEFT_THRESHOLD_M) {
          return 'LEFT_PICKUP_WITHOUT_MARK';
        }
      }
    }

    return null;
  }

}
