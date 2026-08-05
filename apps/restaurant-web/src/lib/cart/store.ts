'use client';
import { create, type UseBoundStore, type StoreApi } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type CartModifier = {
  id: string;
  name: string;
  price_delta_ron: number;
};

export type CartItem = {
  lineId: string;
  itemId: string;
  name: string;
  unitPriceRon: number;
  imageUrl: string | null;
  qty: number;
  modifiers: CartModifier[];
  notes?: string;
};

/** Same two values the checkout quote and the order row use. */
export type Fulfillment = 'DELIVERY' | 'PICKUP';

type CartState = {
  items: CartItem[];
  /**
   * How the customer wants the order handed over.
   *
   * Lives on the cart (2026-08-03) rather than only in checkout state, because
   * the storefront now asks the question above the menu — the point at which a
   * diner actually decides, and where every large delivery site asks it. The
   * checkout picker still exists and still wins; this is the value it opens on.
   *
   * Not authoritative: `/api/checkout/quote` and `/api/checkout/intent` both
   * reject PICKUP when the tenant has `pickup_enabled: false`, so a stale or
   * hand-edited localStorage value cannot produce an order the tenant does not
   * accept.
   */
  fulfillment: Fulfillment;
};

type CartActions = {
  addItem: (input: Omit<CartItem, 'lineId' | 'qty'> & { qty?: number }) => void;
  updateQty: (lineId: string, qty: number) => void;
  removeItem: (lineId: string) => void;
  setFulfillment: (fulfillment: Fulfillment) => void;
  clear: () => void;
  getSubtotal: () => number;
  getCount: () => number;
};

export type CartStore = UseBoundStore<StoreApi<CartState & CartActions>>;

const STORAGE_KEY_PREFIX = 'hir-cart-';

function lineUnitPrice(item: Pick<CartItem, 'unitPriceRon' | 'modifiers'>): number {
  const modSum = item.modifiers.reduce((s, m) => s + m.price_delta_ron, 0);
  return item.unitPriceRon + modSum;
}

function modifiersKey(mods: CartModifier[]): string {
  return mods
    .map((m) => m.id)
    .sort()
    .join('|');
}

const stores = new Map<string, CartStore>();

export function getCartStore(tenantId: string): CartStore {
  const cached = stores.get(tenantId);
  if (cached) return cached;

  const store = create<CartState & CartActions>()(
    persist(
      (set, get) => ({
        items: [],
        fulfillment: 'DELIVERY',

        addItem: (input) => {
          const incoming: CartItem = {
            lineId: `${input.itemId}::${modifiersKey(input.modifiers)}`,
            itemId: input.itemId,
            name: input.name,
            unitPriceRon: input.unitPriceRon,
            imageUrl: input.imageUrl,
            modifiers: input.modifiers,
            notes: input.notes,
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

        // Deliberately keeps `fulfillment`: someone who picked up their last
        // order and comes back to order again should not be silently put back
        // on delivery.
        clear: () => set({ items: [] }),

        getSubtotal: () => get().items.reduce((s, i) => s + lineUnitPrice(i) * i.qty, 0),

        getCount: () => get().items.reduce((s, i) => s + i.qty, 0),
      }),
      {
        name: `${STORAGE_KEY_PREFIX}${tenantId}`,
        storage: createJSONStorage(() => {
          if (typeof window === 'undefined') {
            return {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            };
          }
          return localStorage;
        }),
        partialize: (state) => ({ items: state.items, fulfillment: state.fulfillment }),
      },
    ),
  );

  stores.set(tenantId, store);
  return store;
}

export function lineTotalRon(item: CartItem): number {
  return lineUnitPrice(item) * item.qty;
}
