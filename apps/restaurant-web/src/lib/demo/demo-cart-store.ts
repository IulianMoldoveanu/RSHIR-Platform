'use client';
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

type DemoCartState = {
  items: DemoCartItem[];
};

type DemoCartActions = {
  addItem: (input: Omit<DemoCartItem, 'lineId' | 'qty'> & { qty?: number }) => void;
  updateQty: (lineId: string, qty: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
  getSubtotal: () => number;
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

      clear: () => set({ items: [] }),

      getSubtotal: () => get().items.reduce((s, i) => s + lineUnitPrice(i) * i.qty, 0),

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
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

export function demoLineTotalRon(item: DemoCartItem): number {
  return lineUnitPrice(item) * item.qty;
}
