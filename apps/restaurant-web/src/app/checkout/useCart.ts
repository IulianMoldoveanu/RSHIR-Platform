'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';

/**
 * Checkout reads the cart from sessionStorage key `hir.cart`.
 * RSHIR-9's storefront cart writes this snapshot before navigating to /checkout.
 *
 * Shape is intentionally minimal — server recomputes prices on every quote.
 */
export const cartSnapshotSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      name: z.string(),
      priceRon: z.number().nonnegative(),
      quantity: z.number().int().positive().max(50),
    }),
  ),
});

export type CartSnapshot = z.infer<typeof cartSnapshotSchema>;
export type CartLine = CartSnapshot['items'][number];

export const CART_STORAGE_KEY = 'hir.cart';

export function useCart(): { cart: CartSnapshot | null; loading: boolean } {
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CART_STORAGE_KEY);
      if (!raw) {
        setCart(null);
      } else {
        const parsed = cartSnapshotSchema.safeParse(JSON.parse(raw));
        setCart(parsed.success ? parsed.data : null);
      }
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { cart, loading };
}
