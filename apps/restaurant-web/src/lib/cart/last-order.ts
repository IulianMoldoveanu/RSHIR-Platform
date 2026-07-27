// 2026-07-27 — last-order localStorage cache, same pattern as
// saved-address.ts. A guest who navigates away from /track/<token> (e.g.
// back to the menu) has no way to find their order again — there's no
// account, and the track token isn't shown anywhere else. This remembers
// the most recent order's track token per tenant on this device so the
// homepage can offer a "see your order" link. Tenant-scoped, best-effort:
// any localStorage failure returns null and the link simply doesn't show.
//
// TTL is deliberately short (48h) — this is for finding an order in
// progress, not a permanent history (that's /account, for recognized
// customers).

const KEY_PREFIX = 'hir-last-order:';
const TTL_MS = 48 * 60 * 60 * 1000;

export type LastOrder = {
  token: string;
  createdAt: number;
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function keyFor(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}`;
}

function isValid(v: unknown): v is LastOrder {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.token === 'string' && o.token.length > 0 && typeof o.createdAt === 'number';
}

export function readLastOrder(tenantId: string): LastOrder | null {
  if (!tenantId) return null;
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(keyFor(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return null;
    if (Date.now() - parsed.createdAt > TTL_MS) {
      storage.removeItem(keyFor(tenantId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastOrder(tenantId: string, token: string): void {
  if (!tenantId || !token) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(keyFor(tenantId), JSON.stringify({ token, createdAt: Date.now() }));
  } catch {
    /* private mode / quota / etc. — silently skip */
  }
}
