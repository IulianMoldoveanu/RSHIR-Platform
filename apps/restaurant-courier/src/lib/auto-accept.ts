/**
 * LocalStorage helpers for the auto-accept preference.
 *
 * MVP scope (PR v1): persists the courier's opt-in flag and preferred
 * pickup radius. The wiring into the realtime offer feed is intentionally
 * left for a follow-up PR so the live order flow stays untouched in this
 * change. A consumer can call `shouldAutoAccept(courierLat, courierLng,
 * pickupLat, pickupLng)` to gate the auto-call when the feature is wired
 * later.
 *
 * Default: feature disabled. The courier must explicitly opt in from
 * Setari → Notificari.
 */

import { haversineMeters } from './geofence';

export const ENABLED_KEY = 'hir-courier-auto-accept';
export const RADIUS_KEY = 'hir-courier-auto-accept-radius-km';

export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 15;
export const DEFAULT_RADIUS_KM = 5;

/** Reads opt-in flag. Defaults to false. */
export function isAutoAcceptEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAutoAcceptEnabled(v: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (v) localStorage.setItem(ENABLED_KEY, 'true');
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    // localStorage unavailable — ignore.
  }
}

/** Reads radius (km). Clamped to [MIN, MAX]. Defaults to DEFAULT_RADIUS_KM. */
export function getAutoAcceptRadiusKm(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_RADIUS_KM;
  try {
    const raw = localStorage.getItem(RADIUS_KEY);
    if (!raw) return DEFAULT_RADIUS_KM;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_RADIUS_KM;
    return clampRadius(n);
  } catch {
    return DEFAULT_RADIUS_KM;
  }
}

export function setAutoAcceptRadiusKm(km: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RADIUS_KEY, String(clampRadius(km)));
  } catch {
    // ignore
  }
}

export function clampRadius(km: number): number {
  if (!Number.isFinite(km)) return DEFAULT_RADIUS_KM;
  return Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, Math.round(km)));
}

/**
 * Decision helper for a future offer-feed consumer.
 * Returns true only when ALL conditions hold:
 *   - the user has opted in
 *   - we have a courier fix and a pickup coordinate
 *   - the pickup is within the configured radius
 *
 * Importantly returns false on any missing data so callers can wire this
 * defensively (no surprise auto-accept when GPS is stale).
 */
export function shouldAutoAccept(args: {
  courierLat: number | null;
  courierLng: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
}): boolean {
  if (!isAutoAcceptEnabled()) return false;
  const { courierLat, courierLng, pickupLat, pickupLng } = args;
  if (
    courierLat === null ||
    courierLng === null ||
    pickupLat === null ||
    pickupLng === null
  ) {
    return false;
  }
  const distM = haversineMeters(courierLat, courierLng, pickupLat, pickupLng);
  const radiusM = getAutoAcceptRadiusKm() * 1000;
  return distM <= radiusM;
}
