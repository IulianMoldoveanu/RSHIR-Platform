/**
 * Lane I (2026-05-04) — cart prefill via URL param.
 *
 * Affiliate / social-post deep-link: `?cart=<base64url(JSON)>` where the
 * payload is `[{ menu_item_id: string, qty: number }]`. The client decodes,
 * POSTs the IDs to /api/storefront/cart-prefill (which validates they
 * belong to the resolved tenant), and hydrates the Zustand cart.
 *
 * We use base64url (RFC 4648 §5) so the payload survives querystring
 * encoding without `+`/`/`/`=` collisions.
 */
export type CartPrefillEntry = { menu_item_id: string; qty: number };

const MAX_ENTRIES = 25;

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function encodeCartPrefill(entries: CartPrefillEntry[]): string {
  if (entries.length === 0) return '';
  const json = JSON.stringify(entries);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64url');
  }
  // Browser fallback — btoa needs binary string; URL-safe transform.
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCartPrefill(raw: string): CartPrefillEntry[] | null {
  if (!raw) return null;
  try {
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(raw, 'base64url').toString('utf8')
        : decodeURIComponent(
            escape(
              atob(raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=')),
            ),
          );
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (parsed.length > MAX_ENTRIES) return null;
    const out: CartPrefillEntry[] = [];
    for (const e of parsed) {
      if (typeof e !== 'object' || e === null) return null;
      const r = e as Record<string, unknown>;
      const id = r.menu_item_id;
      const qty = r.qty;
      if (typeof id !== 'string' || !isValidUuid(id)) return null;
      if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 1 || qty > 50) return null;
      out.push({ menu_item_id: id, qty: Math.floor(qty) });
    }
    return out;
  } catch {
    return null;
  }
}
