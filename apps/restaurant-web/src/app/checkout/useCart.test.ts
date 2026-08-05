import { describe, it, expect, beforeEach } from 'vitest';
import { readDurableCart } from './useCart';

// Checkout used to read only the sessionStorage snapshot the cart drawer writes
// on click-through. Verified against production: add an item, load /checkout,
// and it renders "Coșul e gol" while the basket sits untouched in
// localStorage. Refresh, back button, reopened tab and a followed link all hit
// that path. Hence the fallback, and hence these.

const TENANT = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const MOD = '33333333-3333-4333-8333-333333333333';

// Vitest runs in Node here, so back localStorage with a Map — the same shape
// the existing cart tests use. The logic under test is the recovery and the
// schema guard, not the storage engine.
const backing = new Map<string, string>();
const stub = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
  clear: () => backing.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });

function writeStore(state: unknown) {
  stub.setItem(`hir-cart-${TENANT}`, JSON.stringify({ state, version: 0 }));
}

describe('readDurableCart', () => {
  beforeEach(() => {
    backing.clear();
  });

  it('recovers a basket the snapshot never captured', () => {
    writeStore({
      items: [
        { lineId: 'l1', itemId: ITEM, name: 'Cous Cous cu Legume', unitPriceRon: 22, imageUrl: null, qty: 2, modifiers: [] },
      ],
      fulfillment: 'DELIVERY',
    });
    const cart = readDurableCart(TENANT);
    expect(cart).not.toBeNull();
    expect(cart!.items).toHaveLength(1);
    expect(cart!.items[0].name).toBe('Cous Cous cu Legume');
    expect(cart!.items[0].priceRon).toBe(22);
    expect(cart!.items[0].quantity).toBe(2);
  });

  it('translates the modifier price field, which the two shapes spell differently', () => {
    writeStore({
      items: [
        {
          lineId: 'l1',
          itemId: ITEM,
          name: 'Pizza',
          unitPriceRon: 30,
          imageUrl: null,
          qty: 1,
          modifiers: [{ id: MOD, name: 'Extra brânză', price_delta_ron: 5 }],
        },
      ],
      fulfillment: 'DELIVERY',
    });
    const cart = readDurableCart(TENANT);
    expect(cart!.items[0].modifiers[0].priceDeltaRon).toBe(5);
  });

  it('carries the handover mode the customer chose on the menu', () => {
    writeStore({
      items: [{ lineId: 'l1', itemId: ITEM, name: 'X', unitPriceRon: 10, imageUrl: null, qty: 1, modifiers: [] }],
      fulfillment: 'PICKUP',
    });
    expect(readDurableCart(TENANT)!.fulfillment).toBe('PICKUP');
  });

  it('falls back to delivery on an unrecognised handover mode rather than losing the basket', () => {
    writeStore({
      items: [{ lineId: 'l1', itemId: ITEM, name: 'X', unitPriceRon: 10, imageUrl: null, qty: 1, modifiers: [] }],
      fulfillment: 'HELICOPTER',
    });
    const cart = readDurableCart(TENANT);
    expect(cart).not.toBeNull();
    expect(cart!.fulfillment).toBe('DELIVERY');
  });

  it('returns null for an empty basket, so checkout still shows its empty state', () => {
    writeStore({ items: [], fulfillment: 'DELIVERY' });
    expect(readDurableCart(TENANT)).toBeNull();
  });

  it('returns null when nothing was ever stored', () => {
    expect(readDurableCart(TENANT)).toBeNull();
  });

  it('refuses a hand-edited value that does not match the schema', () => {
    // Same guard the snapshot path has: the side door is not a softer door.
    writeStore({
      items: [{ lineId: 'l1', itemId: 'not-a-uuid', name: 'X', unitPriceRon: -5, imageUrl: null, qty: 1, modifiers: [] }],
      fulfillment: 'DELIVERY',
    });
    expect(readDurableCart(TENANT)).toBeNull();
  });

  it('survives a corrupt value instead of throwing into the render', () => {
    localStorage.setItem(`hir-cart-${TENANT}`, '{not json');
    expect(readDurableCart(TENANT)).toBeNull();
  });

  it('reads only this tenant’s cart', () => {
    writeStore({
      items: [{ lineId: 'l1', itemId: ITEM, name: 'X', unitPriceRon: 10, imageUrl: null, qty: 1, modifiers: [] }],
      fulfillment: 'DELIVERY',
    });
    expect(readDurableCart('99999999-9999-4999-8999-999999999999')).toBeNull();
  });
});
