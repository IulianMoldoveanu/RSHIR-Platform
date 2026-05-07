// Tests for the Analytics Agent intents wired through the Master
// Orchestrator dispatcher.
//
// Lane GO Option A (2026-05-08): wire the 4 read-only analytics stubs
// (summary / top_products / recommendations_today / report) plus
// `analytics.explain_anomaly` (Sonnet 4.5).
//
// Vitest runs in Node; we import the Deno-compatible source directly.

import { describe, expect, test, beforeEach } from 'vitest';
import {
  registerIntent,
  dispatchIntent,
  clearRegistryForTesting,
  listIntents,
} from '../../../../../supabase/functions/_shared/master-orchestrator';
import {
  registerAnalyticsIntents,
  __resetForTesting,
  __testHelpers,
} from '../../../../../supabase/functions/_shared/analytics-intents';

// ---------------------------------------------------------------------------
// Mock Supabase — returns canned rows per table. Mirrors the "fluent chain"
// pattern used by the existing master-orchestrator.test.ts mock.
// ---------------------------------------------------------------------------

type Tables = {
  restaurant_orders?: Array<Record<string, unknown>>;
  growth_recommendations?: Array<Record<string, unknown>>;
  copilot_agent_runs?: { count: number };
  tenants?: Record<string, unknown>;
  weather_snapshots?: Record<string, unknown> | null;
  audit_log?: Array<Record<string, unknown>>;
  mv_growth_tenant_metrics_30d?: Record<string, unknown>;
  tenant_agent_trust?: Array<Record<string, unknown>>;
  inserted?: Array<Record<string, unknown>>;
};

function makeQueryBuilder(rows: Array<Record<string, unknown>> | Record<string, unknown> | null) {
  const arr = Array.isArray(rows) ? rows : rows == null ? [] : [rows];
  const result = { data: arr, error: null, count: arr.length };
  // Each chained method returns `this`; terminal methods resolve to data.
  // The builder is a thenable so `await builder` works without a terminal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lt: () => builder,
    gt: () => builder,
    ilike: () => builder,
    or: () => builder,
    order: () => builder,
    limit: () => builder,
    in: () => builder,
    maybeSingle: async () => ({ data: arr[0] ?? null, error: null }),
    then: (
      onFulfilled: (v: typeof result) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

function makeMockSupabase(tables: Tables) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from(name: string): any {
      if (name === 'restaurant_orders') {
        return makeQueryBuilder(tables.restaurant_orders ?? []);
      }
      if (name === 'growth_recommendations') {
        return makeQueryBuilder(tables.growth_recommendations ?? []);
      }
      if (name === 'tenants') {
        return makeQueryBuilder(tables.tenants ?? null);
      }
      if (name === 'weather_snapshots') {
        return makeQueryBuilder(tables.weather_snapshots ?? null);
      }
      if (name === 'audit_log') {
        return makeQueryBuilder(tables.audit_log ?? []);
      }
      if (name === 'mv_growth_tenant_metrics_30d') {
        return makeQueryBuilder(tables.mv_growth_tenant_metrics_30d ?? null);
      }
      if (name === 'tenant_agent_trust') {
        return makeQueryBuilder(tables.tenant_agent_trust ?? []);
      }
      if (name === 'copilot_agent_runs') {
        // Two shapes: count for cap probe, insert for ledger writes.
        const count = tables.copilot_agent_runs?.count ?? 0;
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: async () => ({ data: null, error: null, count }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            tables.inserted = tables.inserted ?? [];
            tables.inserted.push(row);
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: 'run-' + tables.inserted!.length },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      throw new Error('unmocked table: ' + name);
    },
  };
}

// ---------------------------------------------------------------------------
// Pure helper unit tests — fast, no mocks.
// ---------------------------------------------------------------------------

describe('analytics helpers', () => {
  test('periodWindow today has prevFrom = yesterday at 00:00 UTC', () => {
    const w = __testHelpers.periodWindow('today');
    const dayMs = 24 * 3600 * 1000;
    expect(w.prevTo.getTime() - w.prevFrom.getTime()).toBe(dayMs);
    expect(w.label).toBe('azi');
  });

  test('fmtRon formats RO locale with comma decimal', () => {
    const s = __testHelpers.fmtRon(1234.5);
    expect(s).toMatch(/1\.234,50 RON|1234,50 RON/);
  });

  test('aggregateItems prefers lineTotalRon over qty*priceRon', () => {
    const counts = __testHelpers.aggregateItems([
      {
        total_ron: 0,
        status: 'CONFIRMED',
        items: [
          { name: 'Pizza', quantity: 2, priceRon: 25, lineTotalRon: 47 }, // explicit lineTotal wins
          { name: 'Salată', qty: 1, price_ron: 18 }, // legacy snake_case
        ],
      },
    ]);
    expect(counts.Pizza?.qty).toBe(2);
    expect(counts.Pizza?.revenue).toBe(47);
    expect(counts['Salată']?.qty).toBe(1);
    expect(counts['Salată']?.revenue).toBe(18);
  });

  test('aggregateItems skips CANCELLED orders', () => {
    const counts = __testHelpers.aggregateItems([
      { total_ron: 0, status: 'CANCELLED', items: [{ name: 'Pizza', quantity: 99, priceRon: 1 }] },
    ]);
    expect(counts.Pizza).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Registration + dispatch integration tests.
// ---------------------------------------------------------------------------

describe('registerAnalyticsIntents', () => {
  beforeEach(() => {
    clearRegistryForTesting();
    __resetForTesting();
  });

  test('registers all 5 analytics intents (4 stubs + explain_anomaly)', () => {
    registerAnalyticsIntents();
    const names = new Set(listIntents().map((i) => i.name));
    expect(names.has('analytics.summary')).toBe(true);
    expect(names.has('analytics.top_products')).toBe(true);
    expect(names.has('analytics.recommendations_today')).toBe(true);
    expect(names.has('analytics.report')).toBe(true);
    expect(names.has('analytics.explain_anomaly')).toBe(true);
  });

  test('all 5 intents are read-only (bypass trust gate)', () => {
    registerAnalyticsIntents();
    for (const intent of listIntents().filter((i) => i.agent === 'analytics')) {
      expect(intent.readOnly).toBe(true);
    }
  });
});

describe('analytics.summary via dispatcher', () => {
  beforeEach(() => {
    clearRegistryForTesting();
    __resetForTesting();
  });

  test('returns orders + revenue + top_products with no Anthropic call', async () => {
    registerAnalyticsIntents();
    const tables: Tables = {
      restaurant_orders: [
        {
          total_ron: 50,
          status: 'CONFIRMED',
          items: [{ name: 'Pizza', quantity: 1, priceRon: 50 }],
          created_at: new Date().toISOString(),
        },
        {
          total_ron: 30,
          status: 'DELIVERED',
          items: [{ name: 'Pizza', quantity: 1, priceRon: 30 }],
          created_at: new Date().toISOString(),
        },
      ],
    };
    const sb = makeMockSupabase(tables);
    const r = await dispatchIntent(sb, {
      tenantId: 't1',
      channel: 'web',
      intent: 'analytics.summary',
      payload: { period: 'today' },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.state === 'EXECUTED') {
      const d = r.data as { orders: number; revenue_ron: number; top_products: Array<{ name: string }> };
      // Mock returns the same rows for both `curr` and `prev` queries because
      // the builder ignores eq filters; we still validate shape + non-zero.
      expect(d.orders).toBeGreaterThan(0);
      expect(d.revenue_ron).toBeGreaterThan(0);
      expect(d.top_products[0]?.name).toBe('Pizza');
    } else {
      throw new Error('expected EXECUTED state, got ' + (r.ok ? r.state : r.error));
    }
    // Read-only intent → ledger row must be EXECUTED, not PROPOSED.
    expect(tables.inserted?.length).toBe(1);
    expect(tables.inserted?.[0]?.state).toBe('EXECUTED');
  });
});

describe('analytics.explain_anomaly cap', () => {
  beforeEach(() => {
    clearRegistryForTesting();
    __resetForTesting();
  });

  test('returns capped:true when 5 invocations already happened today', async () => {
    registerAnalyticsIntents();
    const tables: Tables = {
      copilot_agent_runs: { count: 5 }, // at cap
      mv_growth_tenant_metrics_30d: { orders_30d: 30, revenue_30d: 1500, aov_30d: 50 },
      restaurant_orders: [],
      tenants: { city_id: null },
      weather_snapshots: null,
      audit_log: [],
    };
    const sb = makeMockSupabase(tables);
    const r = await dispatchIntent(sb, {
      tenantId: 't1',
      channel: 'web',
      intent: 'analytics.explain_anomaly',
      payload: { metric: 'orders' },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.state === 'EXECUTED') {
      const d = r.data as { capped: boolean; hypotheses: Array<{ rank: number; text: string }> };
      expect(d.capped).toBe(true);
      expect(d.hypotheses).toHaveLength(1);
      expect(d.hypotheses[0]?.text).toMatch(/limit|explicații zilnice/i);
    } else {
      throw new Error('expected EXECUTED');
    }
  });

  test('returns hypotheses placeholder when ANTHROPIC_API_KEY is missing', async () => {
    registerAnalyticsIntents();
    // Ensure the key is not set in the test env.
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const tables: Tables = {
        copilot_agent_runs: { count: 0 },
        mv_growth_tenant_metrics_30d: { orders_30d: 30, revenue_30d: 1500, aov_30d: 50 },
        restaurant_orders: [],
        tenants: { city_id: null },
        weather_snapshots: null,
        audit_log: [],
      };
      const sb = makeMockSupabase(tables);
      const r = await dispatchIntent(sb, {
        tenantId: 't1',
        channel: 'web',
        intent: 'analytics.explain_anomaly',
        payload: { metric: 'revenue' },
      });
      expect(r.ok).toBe(true);
      if (r.ok && r.state === 'EXECUTED') {
        const d = r.data as { capped: boolean; hypotheses: Array<{ text: string }> };
        expect(d.capped).toBe(false);
        expect(d.hypotheses[0]?.text).toMatch(/nu este configurat|configurat/i);
      }
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});

describe('analytics.recommendations_today via dispatcher', () => {
  beforeEach(() => {
    clearRegistryForTesting();
    __resetForTesting();
  });

  test('returns shaped data even when no recommendations exist', async () => {
    registerAnalyticsIntents();
    const tables: Tables = { growth_recommendations: [] };
    const sb = makeMockSupabase(tables);
    const r = await dispatchIntent(sb, {
      tenantId: 't1',
      channel: 'telegram',
      intent: 'analytics.recommendations_today',
      payload: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.state === 'EXECUTED') {
      const d = r.data as { days: number; recommendations: unknown[] };
      expect(d.days).toBe(7);
      expect(d.recommendations).toEqual([]);
    }
  });
});
