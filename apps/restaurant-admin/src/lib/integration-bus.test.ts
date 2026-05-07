// Tests for the integration-bus status filter + Custom-only rate limit.
//
// We mock the admin Supabase client to assert which event rows
// (provider_key + event_type) reach `integration_events.insert()` for
// each tenant configuration. The bus is the source of truth for what
// goes on the queue, so a regression here is what would cause a
// tenant to receive (or NOT receive) webhooks they configured.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- mock setup ---

type ProviderRow = {
  provider_key: string;
  config: Record<string, unknown>;
};

type HydratedOrder = {
  id: string;
  status: string;
  payment_method: 'CARD' | 'COD' | null;
  payment_status: string;
  subtotal_ron: number;
  delivery_fee_ron: number;
  total_ron: number;
  items: Array<{ name: string; qty?: number; quantity?: number; priceRon?: number }>;
  notes: string | null;
  customer: { first_name: string | null; phone: string | null } | null;
  address: { line1: string | null; city: string | null } | null;
};

const state: {
  providers: ProviderRow[];
  customCountLastHour: number;
  inserts: Array<Array<Record<string, unknown>>>;
  orderRow: HydratedOrder | null;
} = {
  providers: [],
  customCountLastHour: 0,
  inserts: [],
  orderRow: null,
};

function reset() {
  state.providers = [];
  state.customCountLastHour = 0;
  state.inserts = [];
  state.orderRow = null;
}

vi.mock('./supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'integration_providers') {
        return {
          select: (_cols: string) => ({
            eq: (_c1: string, _v1: string) => ({
              eq: (_c2: string, _v2: boolean) =>
                Promise.resolve({ data: state.providers, error: null }),
            }),
          }),
        };
      }
      if (table === 'integration_events') {
        return {
          // The rate-limit count() path uses this signature:
          select: (_cols: string, _opts?: unknown) => ({
            eq: (_c1: string, _v1: string) => ({
              eq: (_c2: string, _v2: string) => ({
                gte: (_c3: string, _v3: string) =>
                  Promise.resolve({ count: state.customCountLastHour, error: null }),
              }),
            }),
          }),
          // The enqueue path:
          insert: (rows: Array<Record<string, unknown>>) => {
            state.inserts.push(rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'audit_log') {
        return {
          insert: (_row: Record<string, unknown>) => Promise.resolve({ error: null }),
        };
      }
      if (table === 'restaurant_orders') {
        // hydrateOrderPayload — only fires on Custom adapters with empty payload.
        return {
          select: (_cols: string) => ({
            eq: (_c1: string, _v1: string) => ({
              eq: (_c2: string, _v2: string) => ({
                maybeSingle: () =>
                  Promise.resolve({ data: state.orderRow, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        insert: () => Promise.resolve({ error: null }),
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
      };
    },
  }),
}));

vi.mock('./audit', () => ({
  logAudit: () => Promise.resolve(),
}));

// We must import AFTER the mocks are set up.
let dispatchOrderEvent: typeof import('./integration-bus').dispatchOrderEvent;
let dispatchMenuEvent: typeof import('./integration-bus').dispatchMenuEvent;

beforeEach(async () => {
  reset();
  const mod = await import('./integration-bus');
  dispatchOrderEvent = mod.dispatchOrderEvent;
  dispatchMenuEvent = mod.dispatchMenuEvent;
});

afterEach(() => {
  vi.clearAllMocks();
});

const SAMPLE_PAYLOAD = {
  orderId: 'o1',
  source: 'INTERNAL_STOREFRONT',
  status: 'NEW',
  items: [],
  totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
  customer: { firstName: 'A', phone: '+40' },
  dropoff: null,
  notes: null,
};

describe('dispatchOrderEvent — empty tenant', () => {
  it('inserts nothing when no providers active', async () => {
    state.providers = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'created', SAMPLE_PAYLOAD as any);
    expect(state.inserts).toHaveLength(0);
  });
});

describe('dispatchOrderEvent — non-Custom providers', () => {
  it('enqueues for Mock without filtering', async () => {
    state.providers = [{ provider_key: 'mock', config: {} }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'created', SAMPLE_PAYLOAD as any);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toEqual([
      expect.objectContaining({ provider_key: 'mock', event_type: 'order.created' }),
    ]);
  });

  it('enqueues for Freya without filtering', async () => {
    state.providers = [{ provider_key: 'freya', config: {} }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'status_changed', {
      ...SAMPLE_PAYLOAD,
      status: 'PREPARING',
    } as any);
    expect(state.inserts[0]?.[0]?.provider_key).toBe('freya');
  });
});

describe('dispatchOrderEvent — Custom status filter', () => {
  const cfg = { fire_on_statuses: ['NEW', 'DELIVERED'] };

  it('enqueues order.created when NEW is in fire_on_statuses', async () => {
    state.providers = [{ provider_key: 'custom', config: cfg }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'created', SAMPLE_PAYLOAD as any);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]?.[0]?.provider_key).toBe('custom');
  });

  it('drops order.created when NEW NOT in fire_on_statuses', async () => {
    state.providers = [
      { provider_key: 'custom', config: { fire_on_statuses: ['DELIVERED'] } },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'created', SAMPLE_PAYLOAD as any);
    expect(state.inserts).toHaveLength(0);
  });

  it('enqueues status_changed only for whitelisted statuses', async () => {
    state.providers = [{ provider_key: 'custom', config: cfg }];
    // DELIVERED -> pass
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'status_changed', {
      ...SAMPLE_PAYLOAD,
      status: 'DELIVERED',
    } as any);
    expect(state.inserts).toHaveLength(1);

    // PREPARING -> drop
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'status_changed', {
      ...SAMPLE_PAYLOAD,
      status: 'PREPARING',
    } as any);
    expect(state.inserts).toHaveLength(1); // unchanged
  });

  it('order.cancelled gates on CANCELLED in list', async () => {
    state.providers = [
      { provider_key: 'custom', config: { fire_on_statuses: ['CANCELLED'] } },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'cancelled', SAMPLE_PAYLOAD as any);
    expect(state.inserts).toHaveLength(1);

    state.providers = [
      { provider_key: 'custom', config: { fire_on_statuses: ['NEW'] } },
    ];
    state.inserts = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'cancelled', SAMPLE_PAYLOAD as any);
    expect(state.inserts).toHaveLength(0);
  });
});

describe('dispatchOrderEvent — Custom rate limit', () => {
  it('drops Custom row when last-hour count >= 100', async () => {
    state.providers = [
      { provider_key: 'custom', config: { fire_on_statuses: ['NEW'] } },
    ];
    state.customCountLastHour = 100;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'created', SAMPLE_PAYLOAD as any);
    expect(state.inserts).toHaveLength(0);
  });

  it('still enqueues for Mock even when Custom is throttled', async () => {
    state.providers = [
      { provider_key: 'mock', config: {} },
      { provider_key: 'custom', config: { fire_on_statuses: ['NEW'] } },
    ];
    state.customCountLastHour = 100;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'created', SAMPLE_PAYLOAD as any);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toEqual([
      expect.objectContaining({ provider_key: 'mock' }),
    ]);
  });

  it('lets Custom through at 99 events', async () => {
    state.providers = [
      { provider_key: 'custom', config: { fire_on_statuses: ['NEW'] } },
    ];
    state.customCountLastHour = 99;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'created', SAMPLE_PAYLOAD as any);
    expect(state.inserts).toHaveLength(1);
  });
});

describe('dispatchOrderEvent — Custom payload hydration', () => {
  // Status-only dispatches (e.g. updateOrderStatus → DELIVERED) send
  // an empty payload. Custom adapters (Datecs companion, etc.) need
  // the full order to print a receipt — bus must hydrate from DB
  // before enqueueing. Mock/Freya/iiko keep their existing empty-
  // payload contract.

  const FULL_ORDER: HydratedOrder = {
    id: 'o1',
    status: 'DELIVERED',
    payment_method: 'COD',
    payment_status: 'UNPAID',
    subtotal_ron: 51,
    delivery_fee_ron: 10,
    total_ron: 61,
    items: [
      { name: 'Pizza', qty: 1, priceRon: 35 },
      { name: 'Cola', quantity: 2, priceRon: 8 },
    ],
    notes: 'Lasă la portar',
    customer: { first_name: 'Iulian', phone: '+40700000001' },
    address: { line1: 'Str. Foișorului 1', city: 'Brașov' },
  };

  it('hydrates Custom payload when caller passes empty items+totals', async () => {
    state.providers = [
      { provider_key: 'custom', config: { fire_on_statuses: ['DELIVERED'] } },
    ];
    state.orderRow = FULL_ORDER;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'status_changed', {
      orderId: 'o1',
      source: 'INTERNAL_STOREFRONT',
      status: 'DELIVERED',
      items: [],
      totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
      customer: { firstName: '', phone: '' },
      dropoff: null,
      notes: null,
    } as any);
    expect(state.inserts).toHaveLength(1);
    const enqueued = state.inserts[0]?.[0];
    expect(enqueued?.provider_key).toBe('custom');
    const payload = enqueued?.payload as Record<string, unknown>;
    expect(Array.isArray(payload.items)).toBe(true);
    expect((payload.items as unknown[]).length).toBe(2);
    expect((payload.totals as { totalRon: number }).totalRon).toBe(61);
    expect(payload.paymentMethod).toBe('COD');
  });

  it('does NOT hydrate when caller already provided full payload', async () => {
    state.providers = [
      { provider_key: 'custom', config: { fire_on_statuses: ['NEW'] } },
    ];
    state.orderRow = null; // would error if hydration tried to read
    const fullPayload = {
      orderId: 'o1',
      source: 'INTERNAL_STOREFRONT',
      status: 'NEW',
      items: [{ name: 'Pizza', qty: 1, priceRon: 35 }],
      totals: { subtotalRon: 35, deliveryFeeRon: 0, totalRon: 35 },
      customer: { firstName: 'Iulian', phone: '+40' },
      dropoff: null,
      notes: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'created', fullPayload as any);
    expect(state.inserts).toHaveLength(1);
    const payload = state.inserts[0]?.[0]?.payload as Record<string, unknown>;
    expect((payload.items as unknown[]).length).toBe(1);
  });

  it('does NOT hydrate for non-Custom providers (Mock keeps empty-payload contract)', async () => {
    state.providers = [{ provider_key: 'mock', config: {} }];
    state.orderRow = null; // would error if hydration tried to read
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'status_changed', {
      orderId: 'o1',
      source: 'INTERNAL_STOREFRONT',
      status: 'DELIVERED',
      items: [],
      totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
      customer: { firstName: '', phone: '' },
      dropoff: null,
      notes: null,
    } as any);
    expect(state.inserts).toHaveLength(1);
    const payload = state.inserts[0]?.[0]?.payload as Record<string, unknown>;
    // Mock keeps empty payload (existing contract).
    expect((payload.items as unknown[]).length).toBe(0);
  });

  it('hydration failure leaves Custom payload as-is (best-effort, never throws)', async () => {
    state.providers = [
      { provider_key: 'custom', config: { fire_on_statuses: ['DELIVERED'] } },
    ];
    state.orderRow = null; // hydrate returns null → fall back to original empty payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatchOrderEvent('t1', 'status_changed', {
      orderId: 'o1',
      source: 'INTERNAL_STOREFRONT',
      status: 'DELIVERED',
      items: [],
      totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
      customer: { firstName: '', phone: '' },
      dropoff: null,
      notes: null,
    } as any);
    // Event still enqueued — never throws on hydrate failure.
    expect(state.inserts).toHaveLength(1);
  });

  it('hydrates only ONCE even with multiple Custom providers', async () => {
    let hydrateCalls = 0;
    state.providers = [
      { provider_key: 'custom', config: { fire_on_statuses: ['DELIVERED'] } },
      { provider_key: 'custom', config: { fire_on_statuses: ['DELIVERED'] } },
    ];
    state.orderRow = FULL_ORDER;
    // Wrap maybeSingle to count calls. Re-mock just for this test.
    const realFn = state.orderRow;
    Object.defineProperty(state, 'orderRow', {
      configurable: true,
      get() {
        hydrateCalls += 1;
        return realFn;
      },
    });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await dispatchOrderEvent('t1', 'status_changed', {
        orderId: 'o1',
        source: 'INTERNAL_STOREFRONT',
        status: 'DELIVERED',
        items: [],
        totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
        customer: { firstName: '', phone: '' },
        dropoff: null,
        notes: null,
      } as any);
      expect(state.inserts).toHaveLength(1);
      // Two rows enqueued (one per Custom provider) but only ONE DB read.
      expect(state.inserts[0]).toHaveLength(2);
      expect(hydrateCalls).toBe(1);
    } finally {
      // Restore plain data property for next test.
      Object.defineProperty(state, 'orderRow', {
        configurable: true,
        writable: true,
        value: null,
      });
    }
  });
});

describe('dispatchMenuEvent', () => {
  it('skips Custom (no-op in V1)', async () => {
    state.providers = [
      { provider_key: 'mock', config: {} },
      { provider_key: 'custom', config: { fire_on_statuses: ['NEW'] } },
    ];
    await dispatchMenuEvent('t1', 'upserted', {
      itemId: 'i1',
      name: 'X',
      description: null,
      priceRon: 10,
      isAvailable: true,
      categoryId: 'c1',
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toEqual([
      expect.objectContaining({ provider_key: 'mock', event_type: 'menu.upserted' }),
    ]);
  });
});
