'use client';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Deliberately NOT a re-export of `lib/cart/store.ts` — this cart only ever
// exists to power the fake `/demo-storefront` click-through, must never
// touch a real order, and must never share localStorage state with any
// real tenant's cart. Separate module, separate types, separate storage key
// prefix (`hir-demo-cart`, singular — there's only ever one demo tenant, so
// unlike the real store this isn't keyed per tenant id).

export type DemoCartModifier = {
  id: string;
  name: string;
  price_delta_ron: number;
};

export type DemoCartItem = {
  lineId: string;
  itemId: string;
  name: string;
  unitPriceRon: number;
  imageUrl: string | null;
  qty: number;
  modifiers: DemoCartModifier[];
};

/** Same two values the real checkout uses (`app/api/checkout/pricing.ts`), so
 *  the demo tells the same story the product does. */
export type DemoFulfillment = 'DELIVERY' | 'PICKUP';

/** What the demo charges to deliver. A flat stand-in: the real quote comes from
 *  the tenant's zones and tiers, which this fake cart deliberately never calls.
 *  Pickup is free, exactly as in `pricing.ts` (`deliveryFeeRon: 0`). */
export const DEMO_DELIVERY_FEE_RON = 12;

type DemoCartState = {
  items: DemoCartItem[];
  fulfillment: DemoFulfillment;
};

type DemoCartActions = {
  addItem: (input: Omit<DemoCartItem, 'lineId' | 'qty'> & { qty?: number }) => void;
  updateQty: (lineId: string, qty: number) => void;
  removeItem: (lineId: string) => void;
  setFulfillment: (fulfillment: DemoFulfillment) => void;
  clear: () => void;
  getSubtotal: () => number;
  getDeliveryFee: () => number;
  getTotal: () => number;
  getCount: () => number;
};

function lineUnitPrice(item: Pick<DemoCartItem, 'unitPriceRon' | 'modifiers'>): number {
  const modSum = item.modifiers.reduce((s, m) => s + m.price_delta_ron, 0);
  return item.unitPriceRon + modSum;
}

function modifiersKey(mods: DemoCartModifier[]): string {
  return mods
    .map((m) => m.id)
    .sort()
    .join('|');
}

export const useDemoCartStore = create<DemoCartState & DemoCartActions>()(
  persist(
    (set, get) => ({
      items: [],
      fulfillment: 'DELIVERY',

      addItem: (input) => {
        const incoming: DemoCartItem = {
          lineId: `${input.itemId}::${modifiersKey(input.modifiers)}`,
          itemId: input.itemId,
          name: input.name,
          unitPriceRon: input.unitPriceRon,
          imageUrl: input.imageUrl,
          modifiers: input.modifiers,
          qty: input.qty ?? 1,
        };
        const items = get().items;
        const existing = items.find((i) => i.lineId === incoming.lineId);
        if (existing) {
          set({
            items: items.map((i) =>
              i.lineId === incoming.lineId ? { ...i, qty: i.qty + incoming.qty } : i,
            ),
          });
        } else {
          set({ items: [...items, incoming] });
        }
      },

      updateQty: (lineId, qty) => {
        if (qty <= 0) {
          set({ items: get().items.filter((i) => i.lineId !== lineId) });
          return;
        }
        set({ items: get().items.map((i) => (i.lineId === lineId ? { ...i, qty } : i)) });
      },

      removeItem: (lineId) => {
        set({ items: get().items.filter((i) => i.lineId !== lineId) });
      },

      setFulfillment: (fulfillment) => set({ fulfillment }),

      // Keeps the chosen fulfilment across a completed demo order — someone
      // clicking through a second time shouldn't silently be put back on
      // delivery after they picked pickup.
      clear: () => set({ items: [] }),

      getSubtotal: () => get().items.reduce((s, i) => s + lineUnitPrice(i) * i.qty, 0),

      getDeliveryFee: () =>
        get().fulfillment === 'PICKUP' || get().items.length === 0 ? 0 : DEMO_DELIVERY_FEE_RON,

      getTotal: () => get().getSubtotal() + get().getDeliveryFee(),

      getCount: () => get().items.reduce((s, i) => s + i.qty, 0),
    }),
    {
      name: 'hir-demo-cart',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
      partialize: (state) => ({ items: state.items, fulfillment: state.fulfillment }),
    },
  ),
);

export function demoLineTotalRon(item: DemoCartItem): number {
  return lineUnitPrice(item) * item.qty;
}

/**
 * True once the persisted cart has been read back out of localStorage.
 *
 * `createJSONStorage(localStorage)` is a *synchronous* storage, so zustand
 * rehydrates while the store module is first evaluated — before React renders.
 * The server has no localStorage and renders an empty cart, so any component
 * that reads cart state renders something different on the client's very first
 * pass, and React throws "Hydration failed ... this tree will be regenerated on
 * the client". Confirmed in the browser: two of these per visit to the demo
 * checkout.
 *
 * Gating on this hook makes the first client render match the server (it always
 * starts `false`), and the real cart appears on the pass right after.
 */
export function useDemoCartHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Synchronous storage may well have finished before this effect runs, in
    // which case onFinishHydration never fires — so check the flag too.
    if (useDemoCartStore.persist.hasHydrated()) setHydrated(true);
    return useDemoCartStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
