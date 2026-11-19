/**
 * Forward-geocode a free-form address via OpenStreetMap Nominatim,
 * restricted to Romania.
 *
 * SERVER-ONLY. Nominatim's usage policy caps anonymous clients at ~1 req/s
 * and bans the whole egress IP on abuse — every Vercel lambda shares that
 * IP, so this must never run in a browser and callers must rate-limit.
 * `components/pickup/actions.ts` is the only caller and does both.
 *
 * Deliberate near-copy of apps/restaurant-web/src/lib/zones/nominatim.ts:
 * the two apps share no package that can hold a server-side fetch helper,
 * and this admin path is staff-only and low-volume (a pickup point is set
 * once per restaurant). If a third caller appears, promote it to a package
 * instead of copying again.
 */
const HIR_USER_AGENT = 'hir-restaurant-suite/1.0 (contact: ops@hirforyou.ro)';

export type GeocodeHit = { lat: number; lng: number; displayName: string };

export async function geocodeAddressRo(address: string): Promise<GeocodeHit | null> {
  const q = address.trim();
  if (!q) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'ro');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('q', q);

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': HIR_USER_AGENT, Accept: 'application/json' },
    cache: 'no-store',
    // Without a deadline a slow OSM response holds the server action open
    // until the platform's own timeout, and the operator sees a spinner
    // that never resolves.
    signal: AbortSignal.timeout(8_000),
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
