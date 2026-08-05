export type Polygon = {
  type: 'Polygon';
  coordinates: [number, number][][];
};

export type Zone = {
  id: string;
  name: string;
  polygon: Polygon;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

function isLngLatTuple(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
}

/**
 * Normalizes a `delivery_zones.polygon` Json value into the canonical
 * `{type:'Polygon', coordinates:[[[lng,lat],...]]}` shape this page and
 * zone-map.tsx expect. Mirrors coercePolygon in
 * apps/restaurant-web/src/lib/zones/geo.ts — checkout already tolerates a
 * bare-array shape and a flat `{coordinates:[[lng,lat],...]}` shape
 * (zones seeded outside the draw tool, e.g. sales-led onboarding via
 * service-role script, aren't guaranteed to match the tool's own nested
 * GeoJSON output). Without this, a zone in one of those shapes renders
 * fine at checkout but silently vanishes from this admin page — exactly
 * what happened for Delivery House's ~20km radius zone.
 */
export function normalizePolygon(raw: unknown): Polygon | null {
  if (Array.isArray(raw) && raw.every(isLngLatTuple)) {
    return { type: 'Polygon', coordinates: [raw as [number, number][]] };
  }
  if (raw && typeof raw === 'object' && 'coordinates' in raw) {
    const c = (raw as { coordinates: unknown }).coordinates;
    if (Array.isArray(c) && c.every(isLngLatTuple)) {
      return { type: 'Polygon', coordinates: [c as [number, number][]] };
    }
    if (
      Array.isArray(c) &&
      c.length > 0 &&
      Array.isArray(c[0]) &&
      (c[0] as unknown[]).every(isLngLatTuple)
    ) {
      return { type: 'Polygon', coordinates: c as [number, number][][] };
    }
  }
  return null;
}

export type Tier = {
  id: string;
  min_km: number;
  max_km: number;
  price_ron: number;
  sort_order: number;
};

export type ZonePause = {
  id: string;
  zone_id: string;
  reason: string;
  paused_until: string | null;
  paused_at: string;
  paused_via: 'CONTROL_ROOM' | 'HEPY' | 'ADMIN';
  notes: string | null;
};
