// Unit tests for the upsell co-occurrence algorithm.
// The DB calls in upsell.ts are mocked via vi.mock — no live Supabase needed.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the module under test is imported
// ---------------------------------------------------------------------------

// We mock 'server-only' via vitest.config.ts alias (src/test/server-only-shim.ts).

// Mock getSupabaseAdmin so we control what the DB "returns"
const mockFrom = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

// Import AFTER mocks are in place
import { getUpsellSuggestions } from './upsell';

// ---------------------------------------------------------------------------
// Helpers to build fake orders
// ---------------------------------------------------------------------------

type FakeItem = { item_id: string; name: string; price_ron: number; quantity: number };
type FakeOrder = { id: string; items: FakeItem[] };

function order(id: string, ...items: FakeItem[]): FakeOrder {
  return { id, items };
}

function item(item_id: string, name: string, price_ron: number): FakeItem {
  return { item_id, name, price_ron, quantity: 1 };
}

// IDs used across tests
const PIZZA = 'aaaaaaaa-0000-0000-0000-000000000001';
const COLA  = 'aaaaaaaa-0000-0000-0000-000000000002';
const WATER = 'aaaaaaaa-0000-0000-0000-000000000003';
const BREAD = 'aaaaaaaa-0000-0000-0000-000000000004';
const SALAD = 'aaaaaaaa-0000-0000-0000-000000000005';

// ---------------------------------------------------------------------------
// Shared mock wiring
// ---------------------------------------------------------------------------

function wireOrdersQuery(orders: FakeOrder[]) {
  // getUpsellSuggestions calls:
  //   admin.from('restaurant_orders').select(...).eq(...).neq(...).gte(...).limit(...)
  // Each chained method returns an object with the next method.
  // We return the resolved value at .limit() which is the terminal call.
  const limitFn = vi.fn().mockResolvedValue({ data: orders, error: null });
  const gteFn = vi.fn().mockReturnValue({ limit: limitFn });
  const neqFn = vi.fn().mockReturnValue({ gte: gteFn });
  const eqFn = vi.fn().mockReturnValue({ neq: neqFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
  return selectFn;
}

function wireMenuQuery(menuItems: { id: string; name: string; price_ron: number; is_available: boolean }[]) {
  // admin.from('restaurant_menu_items').select(...).eq(...).in(...).eq(...)
  const eqIsAvailable = vi.fn().mockResolvedValue({ data: menuItems, error: null });
  const inFn = vi.fn().mockReturnValue({ eq: eqIsAvailable });
  const eqTenant = vi.fn().mockReturnValue({ in: inFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqTenant });
  return selectFn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getUpsellSuggestions — co-occurrence path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns top co-occurring items, excluding items already in cart', async () => {
    // 60 orders: pizza+cola in 50, pizza+water in 10
    const orders: FakeOrder[] = [
      ...Array.from({ length: 50 }, (_, i) =>
        order(`order-${i}`, item(PIZZA, 'Pizza Margherita', 30), item(COLA, 'Coca-Cola', 8)),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        order(`order-w${i}`, item(PIZZA, 'Pizza Margherita', 30), item(WATER, 'Apă plată', 5)),
      ),
    ];

    const ordersSelectFn = wireOrdersQuery(orders);
    const menuSelectFn = wireMenuQuery([
      { id: COLA, name: 'Coca-Cola', price_ron: 8, is_available: true },
      { id: WATER, name: 'Apă plată', price_ron: 5, is_available: true },
    ]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurant_orders') return { select: ordersSelectFn };
      if (table === 'restaurant_menu_items') return { select: menuSelectFn };
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await getUpsellSuggestions({
      tenantId: 'tenant-1',
      itemsInCart: [{ item_id: PIZZA, qty: 1 }],
    });

    // Cola has higher co-occurrence (50) vs water (10) → comes first
    expect(result.suggestions[0]?.item_id).toBe(COLA);
    expect(result.suggestions[0]?.confidence).toBeGreaterThan(0.5);
    expect(result.suggestions[1]?.item_id).toBe(WATER);

    // Pizza itself must not appear in suggestions
    const ids = result.suggestions.map((s) => s.item_id);
    expect(ids).not.toContain(PIZZA);
  });

  it('filters out items with confidence below 0.15', async () => {
    // 60 orders: pizza+cola 8 times (confidence = 8/60 ≈ 0.13 < 0.15)
    const orders: FakeOrder[] = [
      ...Array.from({ length: 52 }, (_, i) =>
        order(`solo-${i}`, item(PIZZA, 'Pizza', 30)),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        order(`pair-${i}`, item(PIZZA, 'Pizza', 30), item(COLA, 'Cola', 8)),
      ),
    ];

    const ordersSelectFn = wireOrdersQuery(orders);
    const menuSelectFn = wireMenuQuery([
      { id: COLA, name: 'Cola', price_ron: 8, is_available: true },
    ]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurant_orders') return { select: ordersSelectFn };
      if (table === 'restaurant_menu_items') return { select: menuSelectFn };
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await getUpsellSuggestions({
      tenantId: 'tenant-1',
      itemsInCart: [{ item_id: PIZZA, qty: 1 }],
    });

    // confidence ≈ 0.13 → cola should be excluded (falls back to empty since no other candidates)
    expect(result.suggestions).toHaveLength(0);
  });

  it('excludes unavailable menu items', async () => {
    const orders: FakeOrder[] = Array.from({ length: 60 }, (_, i) =>
      order(`o${i}`, item(PIZZA, 'Pizza', 30), item(COLA, 'Cola', 8)),
    );

    const ordersSelectFn = wireOrdersQuery(orders);
    // Cola is_available=false → menu query returns empty (Supabase filters it out)
    const menuSelectFn = wireMenuQuery([]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurant_orders') return { select: ordersSelectFn };
      if (table === 'restaurant_menu_items') return { select: menuSelectFn };
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await getUpsellSuggestions({
      tenantId: 'tenant-1',
      itemsInCart: [{ item_id: PIZZA, qty: 1 }],
    });

    expect(result.suggestions).toHaveLength(0);
  });

  it('returns max 5 suggestions', async () => {
    const allIds = [COLA, WATER, BREAD, SALAD,
      'aaaaaaaa-0000-0000-0000-000000000006',
      'aaaaaaaa-0000-0000-0000-000000000007',
    ];

    // 60 orders: pizza co-occurs with all 6 items equally
    const orders: FakeOrder[] = Array.from({ length: 60 }, (_, i) =>
      order(`o${i}`, item(PIZZA, 'Pizza', 30), ...allIds.map((id) => item(id, `Item ${id}`, 5))),
    );

    const ordersSelectFn = wireOrdersQuery(orders);
    const menuSelectFn = wireMenuQuery(
      allIds.map((id) => ({ id, name: `Item ${id}`, price_ron: 5, is_available: true })),
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurant_orders') return { select: ordersSelectFn };
      if (table === 'restaurant_menu_items') return { select: menuSelectFn };
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await getUpsellSuggestions({
      tenantId: 'tenant-1',
      itemsInCart: [{ item_id: PIZZA, qty: 1 }],
    });

    expect(result.suggestions.length).toBeLessThanOrEqual(5);
  });

  it('accumulates total_expected_lift_cents correctly', async () => {
    const orders: FakeOrder[] = Array.from({ length: 60 }, (_, i) =>
      order(`o${i}`, item(PIZZA, 'Pizza', 30), item(COLA, 'Cola', 10)),
    );

    const ordersSelectFn = wireOrdersQuery(orders);
    const menuSelectFn = wireMenuQuery([
      { id: COLA, name: 'Cola', price_ron: 10, is_available: true },
    ]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurant_orders') return { select: ordersSelectFn };
      if (table === 'restaurant_menu_items') return { select: menuSelectFn };
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await getUpsellSuggestions({
      tenantId: 'tenant-1',
      itemsInCart: [{ item_id: PIZZA, qty: 1 }],
    });

    expect(result.total_expected_lift_cents).toBe(
      result.suggestions.reduce((s, x) => s + x.expected_lift_cents, 0),
    );
  });
});

describe('getUpsellSuggestions — cold-start fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to best-sellers when fewer than 50 orders exist', async () => {
    // Only 10 orders → cold-start
    const orders: FakeOrder[] = Array.from({ length: 10 }, (_, i) =>
      order(`o${i}`, item(COLA, 'Cola', 8), item(WATER, 'Apă', 5)),
    );

    const ordersSelectFn = wireOrdersQuery(orders);
    const menuSelectFn = wireMenuQuery([
      { id: COLA, name: 'Cola', price_ron: 8, is_available: true },
      { id: WATER, name: 'Apă', price_ron: 5, is_available: true },
    ]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurant_orders') return { select: ordersSelectFn };
      if (table === 'restaurant_menu_items') return { select: menuSelectFn };
      throw new Error(`unexpected table: ${table}`);
    });

    const result = await getUpsellSuggestions({
      tenantId: 'tenant-cold',
      // PIZZA not in orders → entirely unrelated cart item
      itemsInCart: [{ item_id: PIZZA, qty: 1 }],
    });

    // Best-sellers (Cola=10 orders, Water=10 orders) returned, Pizza excluded
    expect(result.suggestions.length).toBeGreaterThan(0);
    const ids = result.suggestions.map((s) => s.item_id);
    expect(ids).not.toContain(PIZZA);
    expect(ids).toContain(COLA);
  });

  it('excludes cart items from fallback best-sellers', async () => {
    const orders: FakeOrder[] = Array.from({ length: 10 }, (_, i) =>
      order(`o${i}`, item(COLA, 'Cola', 8)),
    );

    const ordersSelectFn = wireOrdersQuery(orders);
    const menuSelectFn = wireMenuQuery([
      { id: COLA, name: 'Cola', price_ron: 8, is_available: true },
    ]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'restaurant_orders') return { select: ordersSelectFn };
      if (table === 'restaurant_menu_items') return { select: menuSelectFn };
      throw new Error(`unexpected table: ${table}`);
    });

    // Cola is in the cart — should not be suggested
    const result = await getUpsellSuggestions({
      tenantId: 'tenant-cold',
      itemsInCart: [{ item_id: COLA, qty: 1 }],
    });

    const ids = result.suggestions.map((s) => s.item_id);
    expect(ids).not.toContain(COLA);
  });

  it('returns empty suggestions when DB errors', async () => {
    const limitFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } });
    const gteFn = vi.fn().mockReturnValue({ limit: limitFn });
    const neqFn = vi.fn().mockReturnValue({ gte: gteFn });
    const eqFn = vi.fn().mockReturnValue({ neq: neqFn });
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn });

    mockFrom.mockImplementation(() => ({ select: selectFn }));

    const result = await getUpsellSuggestions({
      tenantId: 'tenant-err',
      itemsInCart: [{ item_id: PIZZA, qty: 1 }],
    });

    expect(result.suggestions).toHaveLength(0);
    expect(result.total_expected_lift_cents).toBe(0);
  });
});
