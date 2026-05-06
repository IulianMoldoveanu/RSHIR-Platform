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

const state: {
  providers: ProviderRow[];
  customCountLastHour: number;
  inserts: Array<Array<Record<string, unknown>>>;
} = {
  providers: [],
  customCountLastHour: 0,
  inserts: [],
};

function reset() {
  state.providers = [];
  state.customCountLastHour = 0;
  state.inserts = [];
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
