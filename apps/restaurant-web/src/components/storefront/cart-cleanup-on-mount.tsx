'use client';

// P0 audit #12 — runs once on /checkout/success mount to clear the
// storefront cart + applied promo. We can't clear server-side because the
// cart lives in sessionStorage on the browser. Mount-only effect; idempotent
// if the customer revisits the URL.
import { useEffect } from 'react';
import { CART_STORAGE_KEY } from '@/app/checkout/useCart';
import { writeStoredPromo } from '@/lib/cart/promo';

export function CartCleanupOnMount() {
  useEffect(() => {
    try {
      sessionStorage.removeItem(CART_STORAGE_KEY);
      writeStoredPromo(null);
    } catch {
      /* private mode / disabled storage — best effort */
    }
  }, []);
  return null;
}
