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

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
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
  if (!isBrowser() || !tenantId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(tenantId));
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
  if (!isBrowser() || !tenantId) return;
  if (!addr.line1.trim() || !addr.city.trim()) return;
  try {
    window.localStorage.setItem(
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
  if (!isBrowser() || !tenantId) return;
  try {
    window.localStorage.removeItem(keyFor(tenantId));
  } catch {
    /* ignore */
  }
}
