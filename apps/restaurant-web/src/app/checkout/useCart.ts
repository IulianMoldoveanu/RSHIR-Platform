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
      modifiers: z
        .array(
          z.object({
            id: z.string().uuid(),
            name: z.string(),
            priceDeltaRon: z.number(),
          }),
        )
        .default([]),
      notes: z.string().optional(),
    }),
  ),
  /**
   * Delivery or pickup, as chosen on the storefront (2026-08-03).
   *
   * `.catch()`, not `.default()`, and the difference is a lost basket.
   *
   * The whole snapshot is parsed with `safeParse` and a failure throws the
   * cart away — checkout renders its empty state and the customer starts over.
   * `.default()` covers a *missing* field (every snapshot written before this
   * shipped), but any unrecognised value would still fail the object parse and
   * take the items down with it. Verified: a snapshot carrying
   * `fulfillment: "HELICOPTER"` emptied the cart at checkout.
   *
   * `.catch()` covers both — missing and unrecognised fall back to DELIVERY,
   * and the items survive either way. A wrong handover mode is a radio button
   * the customer can fix in one tap; a lost basket is an abandoned order.
   *
   * Advisory regardless. The checkout picker can still change it, and
   * `/api/checkout/quote` + `/intent` both refuse PICKUP when the tenant has
   * it disabled.
   */
  fulfillment: z.enum(['DELIVERY', 'PICKUP']).catch('DELIVERY'),
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
