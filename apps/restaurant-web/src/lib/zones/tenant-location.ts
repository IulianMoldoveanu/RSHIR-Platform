import type { LatLng } from './geo';

/**
 * Restaurant pickup location.
 *
 * Spec MVP: read `tenants.settings.location_lat / location_lng` if present,
 * otherwise fall back to per-slug defaults below (Brașov demo tenants).
 */
const SLUG_FALLBACKS: Record<string, LatLng> = {
  tenant1: { lat: 45.6427, lng: 25.5887 },
  tenant2: { lat: 45.65, lng: 25.55 },
};

const DEFAULT_FALLBACK: LatLng = { lat: 45.6427, lng: 25.5887 };

export function tenantLocationFromSettings(
  slug: string,
  settings: unknown,
): LatLng {
  if (settings && typeof settings === 'object') {
    const s = settings as Record<string, unknown>;
    const lat = typeof s.location_lat === 'number' ? s.location_lat : null;
    const lng = typeof s.location_lng === 'number' ? s.location_lng : null;
    if (lat !== null && lng !== null) return { lat, lng };
  }
  return SLUG_FALLBACKS[slug] ?? DEFAULT_FALLBACK;
}
