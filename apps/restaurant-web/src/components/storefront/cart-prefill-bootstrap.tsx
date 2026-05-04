'use client';

import { useEffect } from 'react';
import { getCartStore, type CartItem } from '@/lib/cart/store';
import { decodeCartPrefill } from '@/lib/social/cart-prefill';

/**
 * Lane I (2026-05-04) — one-shot URL cart prefill.
 *
 * Reads `?cart=<base64url>` once on mount, validates server-side via
 * /api/storefront/cart-prefill (which checks tenant ownership +
 * availability), merges valid lines into the Zustand cart, and strips the
 * param from the URL so reload doesn't re-add. Existing cart items
 * survive — prefill is additive, not destructive.
 *
 * Shares the storefront layout with `CartBootstrap` (cookie handoff for
 * RSHIR-34 repeat-order). Ordering is intentional: cookie bootstrap runs
 * first (synchronous, no await); URL prefill runs after, so an explicit
 * social-media link adds to whatever the customer already had.
 */
type PrefillLine = {
  itemId: string;
  name: string;
  unitPriceRon: number;
  imageUrl: string | null;
  qty: number;
};

export function CartPrefillBootstrap({ tenantId }: { tenantId: string }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('cart');
    if (!raw) return;

    // Strip the param immediately so a refresh doesn't re-trigger the fetch
    // even if the server call fails.
    url.searchParams.delete('cart');
    window.history.replaceState({}, '', url.toString());

    const entries = decodeCartPrefill(raw);
    if (!entries || entries.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/storefront/cart-prefill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: entries }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items?: PrefillLine[] };
        if (cancelled || !data.items || data.items.length === 0) return;
        const store = getCartStore(tenantId);
        for (const line of data.items) {
          // Use store.addItem so existing-line merge (RSHIR-34) handles
          // duplicate items — same itemId + no modifiers collapses qty.
          store.getState().addItem({
            itemId: line.itemId,
            name: line.name,
            unitPriceRon: line.unitPriceRon,
            imageUrl: line.imageUrl,
            modifiers: [],
            qty: line.qty,
          } as Omit<CartItem, 'lineId' | 'qty'> & { qty?: number });
        }
      } catch {
        // Silent failure — affiliates tinkering with the URL shouldn't
        // produce visible errors for end customers.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);
  return null;
}
