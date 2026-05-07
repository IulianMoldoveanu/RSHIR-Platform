// Ops Agent — Sprint 14 unit tests.
//
// Coverage map (per lane brief: 1 test per intent + mirror parity):
//   1. Mirror parity: OPS_INTENT_NAMES matches the Deno-side registration.
//   2. ops.suggest_delivery_zones: end-to-end via dispatchIntent — mock
//      Supabase + Anthropic, assert result shape.
//   3. ops.optimize_courier_schedule: end-to-end via dispatchIntent —
//      mock Supabase + Anthropic, assert result shape.
//   4. ops.flag_kitchen_bottlenecks: end-to-end via dispatchIntent —
//      mock Supabase + Anthropic, assert result shape + id-hallucination
//      guard (returned id must be in input set).
//   5. Daily cap: 10 EXECUTED rows in copilot_agent_runs blocks the 11th.
//
// We don't hit the live Anthropic API. We stub fetch via setFetchForTesting
// and inject a fake Deno.env so getApiKey() returns 'sk-test'.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  dispatchIntent,
  clearRegistryForTesting,
} from '../../../../../../supabase/functions/_shared/master-orchestrator';
import {
  registerOpsAgentIntents,
  setFetchForTesting,
} from '../../../../../../supabase/functions/_shared/ops-agent';
import {
  OPS_INTENT_NAMES,
  proposedZoneSchema,
  scheduleSlotSchema,
  bottleneckRowSchema,
} from './ops-agent';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type MockState = {
  // count returned by copilot_agent_runs cap check
  forcedCapCount: number;
  // rows returned by each table query (only the fields we use)
  zones: Array<{ name: string; polygon: unknown }>;
  orders: Array<{ delivery_address_id?: string | null; courier_user_id?: string | null; created_at?: string; updated_at?: string; status?: string; items?: unknown; review_reminder_sent_at?: string | null }>;
  addresses: Array<{ id: string; latitude: number | null; longitude: number | null }>;
  shifts: Array<{ started_at: string; ended_at: string | null }>;
  // Couriers who served this tenant (via courier_orders.assigned_courier_user_id).
  tenantCourierIds: Array<{ assigned_courier_user_id: string | null }>;
  fleetManagerCount: number;
  ledgerInsertId: string;
};

function defaultState(): MockState {
  return {
    forcedCapCount: 0,
    zones: [],
    orders: [],
    addresses: [],
    shifts: [],
    tenantCourierIds: [],
    fleetManagerCount: 0,
    ledgerInsertId: '11111111-1111-1111-1111-111111111111',
  };
}

function makeMockSupabase(state: MockState) {
  // Each .from() returns a chainable object that supports the subset of
  // supabase-js used by ops-agent.ts. We treat all `.eq()` / `.in()` /
  // `.gte()` / `.not()` calls as identity passthroughs and resolve at the
  // terminal call (`.select(..., {head}).gte()` for counts, plain promise
  // for data).
  return {
    from: (table: string) => {
      if (table === 'copilot_agent_runs') {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              // Cap-check chain: 4 .eq() then .gte()
              return {
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      gte: async () => ({ count: state.forcedCapCount, error: null }),
                    }),
                  }),
                }),
              };
            }
            return { eq: () => ({ eq: () => ({ eq: () => ({ gte: async () => ({ data: [], error: null }) }) }) }) };
          },
          insert: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: state.ledgerInsertId }, error: null }),
            }),
          }),
        };
      }
      if (table === 'delivery_zones') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({ data: state.zones, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'restaurant_orders') {
        // Build a recursive proxy: every chain step returns the same
        // chainable, except `.limit()` resolves to the data. Lets us
        // support any combination of .eq()/.gte()/.is()/.not() calls
        // (the round-7 fix added a new .is(review_reminder_sent_at, null)
        // step that the older nested-builder couldn't model).
        type Chainable = {
          eq: (...a: unknown[]) => Chainable;
          gte: (...a: unknown[]) => Chainable;
          is: (...a: unknown[]) => Chainable;
          not: (...a: unknown[]) => Chainable;
          in: (...a: unknown[]) => Chainable;
          limit: (...a: unknown[]) => Promise<{ data: typeof state.orders; error: null }>;
        };
        const chain: Chainable = {
          eq: () => chain,
          gte: () => chain,
          is: () => chain,
          not: () => chain,
          in: () => chain,
          limit: async () => ({ data: state.orders, error: null }),
        };
        return { select: () => chain };
      }
      if (table === 'customer_addresses') {
        return {
          select: () => ({
            in: () => ({
              not: () => ({
                not: async () => ({ data: state.addresses, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'courier_shifts') {
        // PR #364 round 1: now scoped via .in('courier_user_id', [...]) before .gte().
        return {
          select: () => ({
            in: () => ({
              gte: () => ({
                limit: async () => ({ data: state.shifts, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'courier_orders') {
        // Used to derive the per-tenant courier id set for shift scoping.
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                not: () => ({
                  limit: async () => ({ data: state.tenantCourierIds, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'tenant_members') {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
            eq: () => ({
              eq: async () => {
                if (opts?.head) return { count: state.fleetManagerCount, error: null };
                return { data: [], error: null };
              },
            }),
          }),
        };
      }
      // tenant_agent_trust never reached — ops intents are readOnly.
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function stubAnthropic(payload: Record<string, unknown>, tokens = { input: 1200, output: 600 }) {
  setFetchForTesting(async () =>
    new Response(
      JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        usage: { input_tokens: tokens.input, output_tokens: tokens.output },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
}

beforeEach(() => {
  clearRegistryForTesting();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Deno = { env: { get: () => 'sk-test' } };
});

afterEach(() => {
  setFetchForTesting(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).Deno;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ops-agent / mirror parity', () => {
  test('OPS_INTENT_NAMES has the 3 expected intents', () => {
    expect(OPS_INTENT_NAMES).toEqual([
      'ops.suggest_delivery_zones',
      'ops.optimize_courier_schedule',
      'ops.flag_kitchen_bottlenecks',
    ]);
  });

  test('Zod schemas accept valid rows + reject obvious violations', () => {
    expect(
      proposedZoneSchema.safeParse({
        name: 'Tractorul-Nord',
        radius_km: 3.5,
        center: { lat: 45.66, lng: 25.61 },
        justification: '12 comenzi în zonă neacoperite.',
        est_orders_per_day: 2.4,
      }).success,
    ).toBe(true);
    expect(
      scheduleSlotSchema.safeParse({
        day_of_week: 5,
        hour: 19,
        recommended_couriers: 3,
        current_avg: 1.2,
        gap: 1.8,
      }).success,
    ).toBe(true);
    expect(
      scheduleSlotSchema.safeParse({
        day_of_week: 7, // out of range
        hour: 19,
        recommended_couriers: 3,
        current_avg: 1.2,
        gap: 1.8,
      }).success,
    ).toBe(false);
    expect(
      bottleneckRowSchema.safeParse({
        menu_item_id: '11111111-1111-1111-1111-111111111111',
        name: 'Pizza',
        avg_prep_min: 35,
        target_prep_min: 22,
        p95_prep_min: 58,
        suggestion: 'Pre-porționați aluatul.',
      }).success,
    ).toBe(true);
  });
});

describe('ops-agent / ops.suggest_delivery_zones', () => {
  test('end-to-end: returns proposed_zones from Anthropic JSON', async () => {
    const state = defaultState();
    state.zones = [{ name: 'Centru', polygon: { type: 'Polygon', coordinates: [[[25.6, 45.65], [25.62, 45.65], [25.62, 45.67], [25.6, 45.67], [25.6, 45.65]]] } }];
    // 6 geocoded orders (over the 5-point minimum)
    state.addresses = Array.from({ length: 6 }).map((_, i) => ({
      id: `addr-${i}`,
      latitude: 45.65 + i * 0.005,
      longitude: 25.6 + i * 0.005,
    }));
    state.orders = state.addresses.map((a) => ({ delivery_address_id: a.id }));

    stubAnthropic({
      proposed_zones: [
        {
          name: 'Tractorul-Nord',
          polygon: null,
          radius_km: 3.5,
          center: { lat: 45.68, lng: 25.62 },
          justification: '12 comenzi în zonă neacoperite de Centru.',
          est_orders_per_day: 2.4,
        },
      ],
      notes: '',
    });

    registerOpsAgentIntents();
    const supabase = makeMockSupabase(state);
    const result = await dispatchIntent(supabase, {
      tenantId: '22222222-2222-2222-2222-222222222222',
      channel: 'web',
      intent: 'ops.suggest_delivery_zones',
      payload: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.state !== 'EXECUTED') throw new Error('expected EXECUTED');
    const data = result.data as { kind: string; proposed_zones: unknown[]; notes: string };
    expect(data.kind).toBe('suggest_delivery_zones');
    expect(data.proposed_zones).toHaveLength(1);
    expect((data.proposed_zones[0] as { name: string }).name).toBe('Tractorul-Nord');
  });

  test('returns empty when fewer than 5 geocoded orders (no Anthropic call)', async () => {
    const state = defaultState();
    state.addresses = [{ id: 'addr-0', latitude: 45.65, longitude: 25.6 }];
    state.orders = [{ delivery_address_id: 'addr-0' }];
    // No fetch stub — assert we didn't call Anthropic.
    setFetchForTesting(async () => {
      throw new Error('Anthropic should not be called for cold-start tenant');
    });

    registerOpsAgentIntents();
    const supabase = makeMockSupabase(state);
    const result = await dispatchIntent(supabase, {
      tenantId: '22222222-2222-2222-2222-222222222222',
      channel: 'web',
      intent: 'ops.suggest_delivery_zones',
      payload: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.state !== 'EXECUTED') throw new Error('expected EXECUTED');
    const data = result.data as { proposed_zones: unknown[]; notes: string };
    expect(data.proposed_zones).toHaveLength(0);
    expect(data.notes).toMatch(/Sub 5 comenzi/);
  });

  test('center coord validation: rejects zone with empty center {}', async () => {
    // Codex P2 (PR #364 round 2) regression test.
    const state = defaultState();
    state.addresses = Array.from({ length: 6 }).map((_, i) => ({
      id: `addr-${i}`,
      latitude: 45.65 + i * 0.005,
      longitude: 25.6 + i * 0.005,
    }));
    state.orders = state.addresses.map((a) => ({ delivery_address_id: a.id }));
    stubAnthropic({
      proposed_zones: [
        {
          name: 'Bad Zone',
          polygon: null,
          radius_km: 3.0,
          center: {}, // missing lat/lng — must be rejected
          justification: 'X',
          est_orders_per_day: 1.0,
        },
      ],
      notes: '',
    });
    registerOpsAgentIntents();
    const supabase = makeMockSupabase(state);
    const result = await dispatchIntent(supabase, {
      tenantId: '22222222-2222-2222-2222-222222222222',
      channel: 'web',
      intent: 'ops.suggest_delivery_zones',
      payload: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('handler_threw');
    expect(result.message).toMatch(/needs valid polygon OR radius\+center/);
  });

  test('string-numeric guard: rejects zone with stringified lat/lng', async () => {
    // Codex P2 (PR #364 round 6) regression test.
    const state = defaultState();
    state.addresses = Array.from({ length: 6 }).map((_, i) => ({
      id: `addr-${i}`,
      latitude: 45.65 + i * 0.005,
      longitude: 25.6 + i * 0.005,
    }));
    state.orders = state.addresses.map((a) => ({ delivery_address_id: a.id }));
    stubAnthropic({
      proposed_zones: [
        {
          name: 'Stringly-typed Zone',
          polygon: null,
          radius_km: 3.0,
          // Strings instead of numbers — must be rejected after the
          // round-6 tightening of clampNumber.
          center: { lat: '45.65', lng: '25.61' },
          justification: 'X',
          est_orders_per_day: 1.0,
        },
      ],
      notes: '',
    });
    registerOpsAgentIntents();
    const supabase = makeMockSupabase(state);
    const result = await dispatchIntent(supabase, {
      tenantId: '22222222-2222-2222-2222-222222222222',
      channel: 'web',
      intent: 'ops.suggest_delivery_zones',
      payload: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('handler_threw');
    expect(result.message).toMatch(/needs valid polygon OR radius\+center/);
  });

  test('polygon validation: rejects zone with empty polygon {type:Polygon} no coords', async () => {
    // Codex P2 (PR #364 round 3) regression test.
    const state = defaultState();
    state.addresses = Array.from({ length: 6 }).map((_, i) => ({
      id: `addr-${i}`,
      latitude: 45.65 + i * 0.005,
      longitude: 25.6 + i * 0.005,
    }));
    state.orders = state.addresses.map((a) => ({ delivery_address_id: a.id }));
    stubAnthropic({
      proposed_zones: [
        {
          name: 'Phantom Polygon',
          polygon: { type: 'Polygon' }, // no coordinates — must be rejected
          radius_km: null,
          center: null,
          justification: 'X',
          est_orders_per_day: 1.0,
        },
      ],
      notes: '',
    });
    registerOpsAgentIntents();
    const supabase = makeMockSupabase(state);
    const result = await dispatchIntent(supabase, {
      tenantId: '22222222-2222-2222-2222-222222222222',
      channel: 'web',
      intent: 'ops.suggest_delivery_zones',
      payload: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('handler_threw');
    expect(result.message).toMatch(/needs valid polygon OR radius\+center/);
  });
});

describe('ops-agent / ops.optimize_courier_schedule', () => {
  test('end-to-end: returns schedule slots from Anthropic JSON', async () => {
    const state = defaultState();
    // 30 orders all at Friday 2026-05-01 19:30 Europe/Bucharest (= 16:30 UTC
    // during DST). The local-time bucketer should land them in dow=5
    // (Friday) hour=19 — proving the Codex-fix.
    // courier_user_id populated so the round-4 fix (restaurant_orders as
    // canonical roster source) finds the tenant's courier set.
    const courierId = '88888888-8888-8888-8888-888888888888';
    state.orders = Array.from({ length: 30 }).map(() => ({
      delivery_address_id: null,
      courier_user_id: courierId,
      created_at: '2026-05-01T16:30:00.000Z',
    }));
    // Backup roster source via courier_orders mirror (fleet-routed path).
    state.tenantCourierIds = [{ assigned_courier_user_id: courierId }];
    // Tenant has one courier; its shift covers the 16-19h UTC window
    // (= 19-22h Europe/Bucharest local).
    state.shifts = [
      { started_at: '2026-05-01T15:00:00.000Z', ended_at: '2026-05-01T19:00:00.000Z' },
    ];
    state.fleetManagerCount = 1;

    stubAnthropic({
      schedule: [
        {
          day_of_week: 5,
          hour: 19,
          recommended_couriers: 3,
          current_avg: 1.0,
          gap: 2.0,
        },
      ],
      summary: 'Ora de vârf vineri 19:00 are nevoie de 2 curieri suplimentari.',
    });

    registerOpsAgentIntents();
    const supabase = makeMockSupabase(state);
    const result = await dispatchIntent(supabase, {
      tenantId: '22222222-2222-2222-2222-222222222222',
      channel: 'web',
      intent: 'ops.optimize_courier_schedule',
      payload: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.state !== 'EXECUTED') throw new Error('expected EXECUTED');
    const data = result.data as { kind: string; schedule: unknown[]; summary: string };
    expect(data.kind).toBe('optimize_courier_schedule');
    expect(data.schedule).toHaveLength(1);
    expect((data.schedule[0] as { hour: number }).hour).toBe(19);
  });
});

describe('ops-agent / ops.flag_kitchen_bottlenecks', () => {
  test('end-to-end: returns bottlenecks; rejects hallucinated item_id', async () => {
    const state = defaultState();
    const itemA = '33333333-3333-3333-3333-333333333333';
    const itemB = '44444444-4444-4444-4444-444444444444';
    // 6 DELIVERED orders, 3 with itemA (slow ~30 min), 3 with itemB (fast ~15 min)
    const slowSpan = (mins: number) => ({
      delivery_address_id: null,
      status: 'DELIVERED',
      created_at: '2026-05-05T12:00:00.000Z',
      updated_at: new Date(new Date('2026-05-05T12:00:00.000Z').getTime() + mins * 60000).toISOString(),
      items: [{ itemId: itemA, name: 'Pizza Slow' }],
    });
    const fastSpan = (mins: number) => ({
      delivery_address_id: null,
      status: 'DELIVERED',
      created_at: '2026-05-05T12:00:00.000Z',
      updated_at: new Date(new Date('2026-05-05T12:00:00.000Z').getTime() + mins * 60000).toISOString(),
      items: [{ itemId: itemB, name: 'Salad Fast' }],
    });
    state.orders = [
      slowSpan(28),
      slowSpan(32),
      slowSpan(40),
      fastSpan(12),
      fastSpan(15),
      fastSpan(18),
    ];

    stubAnthropic({
      bottlenecks: [
        {
          menu_item_id: itemA,
          name: 'Pizza Slow',
          avg_prep_min: 33.3,
          target_prep_min: 22.0,
          p95_prep_min: 40.0,
          suggestion: 'Pre-porționați aluatul în orele de vârf.',
        },
      ],
      notes: '',
    });

    registerOpsAgentIntents();
    const supabase = makeMockSupabase(state);
    const result = await dispatchIntent(supabase, {
      tenantId: '22222222-2222-2222-2222-222222222222',
      channel: 'web',
      intent: 'ops.flag_kitchen_bottlenecks',
      payload: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.state !== 'EXECUTED') throw new Error('expected EXECUTED');
    const data = result.data as { kind: string; bottlenecks: unknown[] };
    expect(data.kind).toBe('flag_kitchen_bottlenecks');
    expect(data.bottlenecks).toHaveLength(1);
    expect((data.bottlenecks[0] as { menu_item_id: string }).menu_item_id).toBe(itemA);
  });

  test('hallucination guard: rejects bottleneck with id not in input set', async () => {
    const state = defaultState();
    const realId = '33333333-3333-3333-3333-333333333333';
    const fakeId = '99999999-9999-9999-9999-999999999999';
    state.orders = [
      {
        delivery_address_id: null,
        status: 'DELIVERED',
        created_at: '2026-05-05T12:00:00.000Z',
        updated_at: '2026-05-05T12:30:00.000Z',
        items: [{ itemId: realId, name: 'Pizza' }],
      },
      {
        delivery_address_id: null,
        status: 'DELIVERED',
        created_at: '2026-05-05T12:00:00.000Z',
        updated_at: '2026-05-05T12:35:00.000Z',
        items: [{ itemId: realId, name: 'Pizza' }],
      },
      {
        delivery_address_id: null,
        status: 'DELIVERED',
        created_at: '2026-05-05T12:00:00.000Z',
        updated_at: '2026-05-05T12:40:00.000Z',
        items: [{ itemId: realId, name: 'Pizza' }],
      },
      // need a 2nd item for the >=2 items branch
      {
        delivery_address_id: null,
        status: 'DELIVERED',
        created_at: '2026-05-05T12:00:00.000Z',
        updated_at: '2026-05-05T12:15:00.000Z',
        items: [{ itemId: '55555555-5555-5555-5555-555555555555', name: 'Salad' }],
      },
      {
        delivery_address_id: null,
        status: 'DELIVERED',
        created_at: '2026-05-05T12:00:00.000Z',
        updated_at: '2026-05-05T12:18:00.000Z',
        items: [{ itemId: '55555555-5555-5555-5555-555555555555', name: 'Salad' }],
      },
      {
        delivery_address_id: null,
        status: 'DELIVERED',
        created_at: '2026-05-05T12:00:00.000Z',
        updated_at: '2026-05-05T12:20:00.000Z',
        items: [{ itemId: '55555555-5555-5555-5555-555555555555', name: 'Salad' }],
      },
    ];

    stubAnthropic({
      bottlenecks: [
        {
          menu_item_id: fakeId, // hallucinated
          name: 'Phantom',
          avg_prep_min: 99.0,
          target_prep_min: 22.0,
          p95_prep_min: 120.0,
          suggestion: 'X',
        },
      ],
      notes: '',
    });

    registerOpsAgentIntents();
    const supabase = makeMockSupabase(state);
    const result = await dispatchIntent(supabase, {
      tenantId: '22222222-2222-2222-2222-222222222222',
      channel: 'web',
      intent: 'ops.flag_kitchen_bottlenecks',
      payload: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('handler_threw');
    expect(result.message).toMatch(/anthropic_item_id_mismatch/);
  });
});

describe('ops-agent / daily cap', () => {
  test('11th invocation within 24h is blocked (daily_cap_reached)', async () => {
    const state = defaultState();
    state.forcedCapCount = 10; // already at cap

    setFetchForTesting(async () => {
      throw new Error('Anthropic should not be called when capped');
    });

    registerOpsAgentIntents();
    const supabase = makeMockSupabase(state);
    const result = await dispatchIntent(supabase, {
      tenantId: '22222222-2222-2222-2222-222222222222',
      channel: 'web',
      intent: 'ops.suggest_delivery_zones',
      payload: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('handler_threw');
    expect(result.message).toMatch(/daily_cap_reached/);
  });
});
