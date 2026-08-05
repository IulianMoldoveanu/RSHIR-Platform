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

/**
 * The durable cart, read straight out of the storefront's zustand-persist key.
 *
 * The snapshot above is written by the cart drawer at the moment the customer
 * clicks through to checkout, and it lives in sessionStorage. That covers the
 * click-through and nothing else: refresh the checkout page, come back to it
 * with the back button, reopen the tab, or follow the URL again, and there is
 * no snapshot — while the customer's actual basket is still sitting in
 * localStorage, intact. Checkout then told them "Coșul e gol" over a cart it
 * had simply not looked at. Verified on production against a real storefront.
 *
 * So when the snapshot is missing, fall back to the real thing.
 */
export function readDurableCart(tenantId: string): CartSnapshot | null {
  try {
    const raw = localStorage.getItem(`hir-cart-${tenantId}`);
    if (!raw) return null;
    const outer = JSON.parse(raw) as {
      state?: {
        items?: {
          itemId?: string;
          name?: string;
          unitPriceRon?: number;
          qty?: number;
          notes?: string;
          modifiers?: { id: string; name: string; price_delta_ron: number }[];
        }[];
        fulfillment?: string;
      };
    };
    const items = (outer.state?.items ?? []).map((it) => ({
      itemId: it.itemId,
      name: it.name,
      priceRon: it.unitPriceRon,
      quantity: it.qty,
      // The store spells this price_delta_ron; the snapshot spells it
      // priceDeltaRon. Same number, two names — mapped, not assumed.
      modifiers: (it.modifiers ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        priceDeltaRon: m.price_delta_ron,
      })),
      ...(it.notes ? { notes: it.notes } : {}),
    }));
    if (items.length === 0) return null;

    // Parsed through the same schema as the snapshot, so a hand-edited
    // localStorage value cannot reach checkout by the side door.
    const parsed = cartSnapshotSchema.safeParse({
      items,
      fulfillment: outer.state?.fulfillment,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function useCart(tenantId?: string): { cart: CartSnapshot | null; loading: boolean } {
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CART_STORAGE_KEY);
      const fromSnapshot = raw ? cartSnapshotSchema.safeParse(JSON.parse(raw)) : null;
      if (fromSnapshot?.success) {
        setCart(fromSnapshot.data);
      } else {
        setCart(tenantId ? readDurableCart(tenantId) : null);
      }
    } catch {
      setCart(tenantId ? readDurableCart(tenantId) : null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  return { cart, loading };
}
