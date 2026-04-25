'use client';

import { useEffect } from 'react';
import { getCartStore, type CartItem } from '@/lib/cart/store';

const COOKIE_PREFIX = 'hir-cart-bootstrap-';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const c = part.trimStart();
    if (c.startsWith(target)) return decodeURIComponent(c.slice(target.length));
  }
  return null;
}

function clearCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/**
 * RSHIR-34 — one-shot bootstrap. When the repeat-order server action sets
 * `hir-cart-bootstrap-{tenantId}` and redirects to `/`, this picks up the
 * cookie, replaces the Zustand cart with its items, and clears the cookie.
 * The actual cart persists in localStorage; the cookie is only the handoff.
 */
export function CartBootstrap({ tenantId }: { tenantId: string }) {
  useEffect(() => {
    const name = `${COOKIE_PREFIX}${tenantId}`;
    const raw = readCookie(name);
    if (!raw) return;
    clearCookie(name);
    try {
      const parsed = JSON.parse(raw) as { items?: CartItem[] };
      if (!Array.isArray(parsed.items)) return;
      const store = getCartStore(tenantId);
      store.setState({ items: parsed.items });
    } catch {
      // malformed cookie — ignore.
    }
  }, [tenantId]);
  return null;
}
