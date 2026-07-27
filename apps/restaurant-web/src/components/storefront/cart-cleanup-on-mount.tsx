'use client';

// P0 audit #12 — runs once on /checkout/success mount to clear the
// storefront cart + applied promo. We can't clear server-side because the
// cart lives in the browser. Mount-only effect; idempotent if the customer
// revisits the URL.
//
// Two separate carts exist and both need clearing: the /checkout/useCart.ts
// sessionStorage snapshot (read-only copy the checkout flow works from) AND
// the real Zustand+localStorage cart (lib/cart/store.ts, key
// `hir-cart-<tenantId>`) that drives the storefront's cart pill/drawer. The
// original P0 audit #12 fix only cleared the former, so the storefront cart
// kept showing the just-ordered items after a successful order — this
// clears both.
import { useEffect } from 'react';
import { CART_STORAGE_KEY } from '@/app/checkout/useCart';
import { writeStoredPromo } from '@/lib/cart/promo';
import { getCartStore } from '@/lib/cart/store';
import { writeLastOrder } from '@/lib/cart/last-order';

export function CartCleanupOnMount({
  tenantId,
  trackToken,
}: {
  tenantId: string;
  trackToken?: string;
}) {
  useEffect(() => {
    try {
      sessionStorage.removeItem(CART_STORAGE_KEY);
      writeStoredPromo(null);
    } catch {
      /* private mode / disabled storage — best effort */
    }
    getCartStore(tenantId).getState().clear();
    if (trackToken) writeLastOrder(tenantId, trackToken);
  }, [tenantId, trackToken]);
  return null;
}
