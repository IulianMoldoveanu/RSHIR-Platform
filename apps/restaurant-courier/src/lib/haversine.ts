/**
 * Haversine distance helpers — shared across server and client modules.
 * Extracted from three copy-paste sites:
 *   - dashboard/orders/page.tsx
 *   - components/earnings-preview.tsx
 *   - components/rider-map.tsx (meters variant)
 */

const R_KM = 6_371;
const R_M = 6_371_000;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number, R: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversine(lat1, lng1, lat2, lng2, R_KM);
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversine(lat1, lng1, lat2, lng2, R_M);
}
