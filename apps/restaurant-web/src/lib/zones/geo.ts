/**
 * Geo utilities — point-in-polygon (ray-casting), haversine distance.
 * Pure, dependency-free, usable on both server and client.
 */

export type LatLng = { lat: number; lng: number };

/**
 * GeoJSON-style polygon: array of [lng, lat] pairs.
 * `delivery_zones.polygon` is stored as Json — callers pass the parsed value.
 */
export type Polygon = Array<[number, number]>;

/**
 * Ray-casting point-in-polygon (returns true if `p` lies inside `polygon`).
 * Polygon vertices are [lng, lat]. Self-closes if first/last differ.
 */
export function pointInPolygon(p: LatLng, polygon: Polygon): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Haversine great-circle distance in kilometres.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Coerce the `delivery_zones.polygon` Json value into a Polygon.
 * Accepts either:
 *   - bare array: [[lng,lat], [lng,lat], ...]
 *   - { coordinates: [[lng,lat], ...] }
 * Returns [] if shape is unrecognised.
 */
export function coercePolygon(raw: unknown): Polygon {
  if (Array.isArray(raw)) {
    if (raw.every(isLngLatTuple)) return raw as Polygon;
  }
  if (raw && typeof raw === 'object' && 'coordinates' in raw) {
    const c = (raw as { coordinates: unknown }).coordinates;
    if (Array.isArray(c) && c.every(isLngLatTuple)) return c as Polygon;
    if (Array.isArray(c) && c.length > 0 && Array.isArray(c[0]) && (c[0] as unknown[]).every(isLngLatTuple)) {
      // GeoJSON Polygon: coordinates is [[[lng,lat], ...]]
      return c[0] as Polygon;
    }
  }
  return [];
}

function isLngLatTuple(v: unknown): boolean {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
}
