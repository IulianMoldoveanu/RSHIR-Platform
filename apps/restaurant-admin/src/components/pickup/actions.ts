'use server';

import { checkLimit } from '@/lib/rate-limit';
import { geocodeAddressRo } from '@/lib/geocode';
import { getActiveTenant } from '@/lib/tenant';

export type GeocodeActionResult =
  | { ok: true; lat: number; lng: number; label: string }
  | { ok: false; error: 'unauthenticated' | 'rate_limited' | 'too_short' | 'not_found' };

/**
 * Turn the address the operator typed into a map pin.
 *
 * Auth is any signed-in dashboard user: this reveals nothing tenant-scoped,
 * it only forwards a public address lookup. The cap is per user and
 * deliberately tight (5 lookups, one more every 5s) because the outbound
 * call lands on OpenStreetMap's shared quota for our whole egress IP, and
 * placing a pickup point needs a handful of tries, not hundreds.
 */
export async function geocodePickupAddressAction(query: string): Promise<GeocodeActionResult> {
  const auth = await getActiveTenant().catch(() => null);
  if (!auth?.user) return { ok: false, error: 'unauthenticated' };

  const q = typeof query === 'string' ? query.trim().slice(0, 200) : '';
  if (q.length < 4) return { ok: false, error: 'too_short' };

  const limit = checkLimit(`pickup-geocode:${auth.user.id}`, { capacity: 5, refillPerSec: 0.2 });
  if (!limit.ok) return { ok: false, error: 'rate_limited' };

  const hit = await geocodeAddressRo(q).catch(() => null);
  if (!hit) return { ok: false, error: 'not_found' };

  return { ok: true, lat: hit.lat, lng: hit.lng, label: hit.displayName };
}
