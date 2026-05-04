import type { LatLng } from './geo';

/**
 * Restaurant pickup location.
 *
 * Reads tenant pickup coords from settings, accepting BOTH shapes that ship
 * in production today:
 *
 *   1. Flat keys:  settings.location_lat / settings.location_lng
 *      (written by the admin Operations & program save action)
 *   2. Nested:     settings.location.lat / settings.location.lng
 *      (written by the GloriaFood / onboarding wizard import path)
 *
 * The two paths emerged independently; tenants imported via the wizard land
 * with only the nested shape and the storefront would silently substitute
 * the per-slug demo fallback below — placing pickup at the wrong physical
 * point and shifting every distance/tier/dispatch decision. Reading both
 * keeps the storefront aligned with whichever shape onboarded a tenant.
 *
 * Per-slug fallbacks remain for the legacy demo tenants seeded before the
 * settings.location keys existed.
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
    // Shape 1: flat keys (admin Operations save).
    const flatLat = typeof s.location_lat === 'number' ? s.location_lat : null;
    const flatLng = typeof s.location_lng === 'number' ? s.location_lng : null;
    if (flatLat !== null && flatLng !== null) return { lat: flatLat, lng: flatLng };

    // Shape 2: nested object (onboarding wizard / GloriaFood import).
    const nested = s.location;
    if (nested && typeof nested === 'object') {
      const n = nested as Record<string, unknown>;
      const nLat = typeof n.lat === 'number' ? n.lat : null;
      const nLng = typeof n.lng === 'number' ? n.lng : null;
      if (nLat !== null && nLng !== null) return { lat: nLat, lng: nLng };
    }
  }
  return SLUG_FALLBACKS[slug] ?? DEFAULT_FALLBACK;
}
