import type { LatLng } from './geo';

/**
 * Forward-geocode a free-form address via OpenStreetMap Nominatim.
 * Restricted to Romania (countrycodes=ro). Returns null if no hit.
 *
 * Public endpoint — fair-use applies. We send a descriptive User-Agent.
 */
export async function geocodeAddressRo(address: string): Promise<LatLng | null> {
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
      'User-Agent': `hir-restaurant-suite/0.1 (contact: ${process.env.NOMINATIM_CONTACT_EMAIL || 'ops@example.com'})`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const json = (await res.json()) as Array<{ lat: string; lon: string }>;
  const hit = json[0];
  if (!hit) return null;

  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
