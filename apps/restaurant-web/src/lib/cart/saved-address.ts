// QW7 (UIUX audit 2026-05-08) — saved-address localStorage cache.
//
// Returning guests who haven't been recognized by the customer-cookie
// fast-path (cleared cookies, fresh device, incognito) still get an
// address pre-fill from their last order on this device. Tenant-scoped
// so cross-tenant addresses don't leak. Strictly best-effort: any
// localStorage failure (Safari private mode, quota, server side) returns
// null and the user types the address fresh.

const KEY_PREFIX = 'hir-last-address:';

export type SavedAddress = {
  line1: string;
  city: string;
  postalCode: string;
};

// Codex review #347 P2: simply checking `typeof window.localStorage !==
// 'undefined'` doesn't shield us from third-party-iframe contexts where
// merely accessing the property throws `SecurityError` (we run the
// storefront in embed mode by design — `isEmbedMode`). Wrap every probe
// in try/catch so any access failure is treated as "no storage" — reads
// return null, writes/clears no-op silently.
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

function isValid(v: unknown): v is SavedAddress {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.line1 === 'string' &&
    typeof o.city === 'string' &&
    typeof o.postalCode === 'string'
  );
}

export function readSavedAddress(tenantId: string): SavedAddress | null {
  if (!tenantId) return null;
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(keyFor(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return null;
    if (!parsed.line1.trim() || !parsed.city.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSavedAddress(tenantId: string, addr: SavedAddress): void {
  if (!tenantId) return;
  if (!addr.line1.trim() || !addr.city.trim()) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      keyFor(tenantId),
      JSON.stringify({
        line1: addr.line1.trim(),
        city: addr.city.trim(),
        postalCode: addr.postalCode.trim(),
      }),
    );
  } catch {
    /* private mode / quota / etc. — silently skip */
  }
}

export function clearSavedAddress(tenantId: string): void {
  if (!tenantId) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(keyFor(tenantId));
  } catch {
    /* ignore */
  }
}
