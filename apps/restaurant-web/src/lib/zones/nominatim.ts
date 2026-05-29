import type { LatLng } from './geo';

/**
 * Forward-geocode a free-form address via OpenStreetMap Nominatim.
 * Restricted to Romania (countrycodes=ro). Returns null if no hit.
 *
 * SERVER-ONLY. Calling this from a client component shifts the rate-limit
 * burden to each customer's IP (1 req/sec OSM policy, ban on NAT) and
 * leaks a falsy User-Agent because `process.env.*` only resolves at build
 * time for `NEXT_PUBLIC_*` vars in the browser. The storefront checkout
 * routes this through `/api/checkout/geocode` which rate-limits, caches,
 * and serializes calls against OSM. The admin onboard wizard imports this
 * directly from a server route — that's fine.
 *
 * Nominatim Usage Policy (https://operations.osmfoundation.org/policies/nominatim/)
 * mandates a descriptive User-Agent with a real contact. The default is
 * hard-coded here because Vercel env vars get lost on rebuilds and a
 * stub-looking UA ("ops@example.com") gets the whole IP block banned.
 */
const HIR_USER_AGENT = 'hir-restaurant-suite/1.0 (contact: ops@hirforyou.ro)';

export type GeocodeHit = LatLng & { displayName: string };

export async function geocodeAddressRoVerbose(address: string): Promise<GeocodeHit | null> {
  const q = address.trim();
  if (!q) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'ro');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('q', q);

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': HIR_USER_AGENT,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const json = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
  const hit = json[0];
  if (!hit) return null;

  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, displayName: hit.display_name ?? '' };
}

export async function geocodeAddressRo(address: string): Promise<LatLng | null> {
  const hit = await geocodeAddressRoVerbose(address);
  if (!hit) return null;
  return { lat: hit.lat, lng: hit.lng };
}
