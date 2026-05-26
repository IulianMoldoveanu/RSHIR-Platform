/**
 * Shared geo helpers — pure functions, zero deps.
 *
 * Extracted from the 3+ duplicate copies that lived inside
 * apps/restaurant-web, apps/restaurant-admin, and apps/restaurant-courier.
 * Same formula in every site; one source of truth from now on.
 */

export type LatLng = { lat: number; lng: number };

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Great-circle distance in metres (alias used by the geofence library). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/**
 * Convert a courier-to-next-stop distance into a courier-facing ETA in
 * minutes. Brașov urban average ~22 km/h with stops; +2 min handover
 * buffer; clamped to a minimum of 2 min so we never render "~0 min".
 */
export function etaMinutesFromKm(km: number, avgKmh = 22, handoverBufferMin = 2): number {
  if (!Number.isFinite(km) || km < 0) return handoverBufferMin;
  const minutes = (km / Math.max(1, avgKmh)) * 60 + handoverBufferMin;
  return Math.max(handoverBufferMin, Math.round(minutes));
}
