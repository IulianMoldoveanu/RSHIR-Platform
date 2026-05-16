// Growth Agent (Deno-side) — unit tests for F6 closure.
//
// Verifies the two read intents register correctly + each handler's
// plan/execute contract. No Anthropic surface (the daily cron is the
// canonical producer; on-demand surface is a pure DB read), so we only
// need a Supabase mock.
//
// Coverage map:
//   1. Registration — both intents land in the registry under agent=growth.
//   2. growth.recommendations_for_tenant — happy path, status filter,
//      limit clamp, DB error.
//   3. growth.recommendation_get — happy path, invalid uuid, not found.
//
// Placement deviation: same as cs-agent-edge.test.ts — vitest only globs
// `apps/restaurant-admin/src/**/*.test.ts`, so the Deno source under
// `supabase/functions/_shared/` is reached via a relative import.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  clearRegistryForTesting,
  listIntents,
  type IntentRegistration,
} from '../../../../../supabase/functions/_shared/master-orchestrator';
import {
  registerGrowthIntents,
  __resetGrowthRegisteredForTesting,
} from '../../../../../supabase/functions/_shared/growth-agent';

// ---------------------------------------------------------------------------
// Supabase mock — a chainable builder that records every call on a single
// `growth_recommendations` table. The growth handlers reassign the query
// across `.eq` chains and only resolve on the final `await`, so the mock
// returns `this` from each chain method and exposes `.then` for awaiting.
// ---------------------------------------------------------------------------

type RowsResponse = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
type SingleResponse = { data: Record<string, unknown> | null; error: { message: string } | null };

type SbState = {
  // Result the chainable resolves to when awaited (list path).
  listResult: RowsResponse;
  // Result returned from `.maybeSingle()` (get path).
  singleResult: SingleResponse;
  // Recorded calls so tests can spy filters/limits.
  calls: {
    select: string[];
    eq: Array<{ col: string; val: unknown }>;
    order: Array<{ col: string; opts: unknown }>;
    limit: number[];
  };
};

function freshState(overrides: Partial<SbState> = {}): SbState {
  return {
    listResult: { data: [], error: null },
    singleResult: { data: null, error: null },
    calls: { select: [], eq: [], order: [], limit: [] },
    ...overrides,
  };
}

function makeMockSb(state: SbState) {
  const chain: Record<string, unknown> = {
    select(cols: string) {
      state.calls.select.push(cols);
      return chain;
    },
    eq(col: string, val: unknown) {
      state.calls.eq.push({ col, val });
      return chain;
    },
    order(col: string, opts: unknown) {
      state.calls.order.push({ col, opts });
      return chain;
    },
    limit(n: number) {
      state.calls.limit.push(n);
      return chain;
    },
    maybeSingle: async () => state.singleResult,
    // List path resolves the chain via thenable.
    then(cb: (v: RowsResponse) => unknown) {
      return Promise.resolve(state.listResult).then(cb);
    },
  };
  return {
    from(table: string) {
      if (table !== 'growth_recommendations') {
        throw new Error('unmocked table: ' + table);
      }
      return chain;
    },
  };
}

function getHandler(name: string): IntentRegistration {
  const reg = listIntents().find((r) => r.name === name);
  if (!reg) throw new Error(`intent not registered: ${name}`);
  return reg;
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  clearRegistryForTesting();
  __resetGrowthRegisteredForTesting();
});

afterEach(() => {
  clearRegistryForTesting();
  __resetGrowthRegisteredForTesting();
});

// ---------------------------------------------------------------------------
// 1. Registration
// ---------------------------------------------------------------------------

describe('growth-agent / registration', () => {
  test('registers both intents idempotently under agent=growth, readOnly:true', () => {
    registerGrowthIntents();
    registerGrowthIntents(); // dedup guard
    const growth = listIntents().filter((i) => i.agent === 'growth');
    const names = growth.map((i) => i.name).sort();
    expect(names).toEqual([
      'growth.recommendation_get',
      'growth.recommendations_for_tenant',
    ]);
    for (const reg of growth) {
      expect(reg.readOnly).toBe(true);
      expect(reg.defaultCategory).toBe('growth.read');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. growth.recommendations_for_tenant
// ---------------------------------------------------------------------------

describe('growth.recommendations_for_tenant', () => {
  function ctxWith(sb: SbState) {
    return {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(sb),
    };
  }

  test('happy path returns rows from the mock supabase', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendations_for_tenant');
    const sb = freshState({
      listResult: {
        data: [
          { id: 'r1', generated_at: '2026-05-10', category: 'menu', priority: 1, title_ro: 'X', suggested_action_ro: 'Y', status: 'pending', decided_at: null },
          { id: 'r2', generated_at: '2026-05-09', category: 'ops', priority: 2, title_ro: 'A', suggested_action_ro: 'B', status: 'pending', decided_at: null },
        ],
        error: null,
      },
    });
    const ctx = ctxWith(sb);
    const plan = await reg.handler.plan(ctx, {});
    expect(plan.actionCategory).toBe('growth.read');
    expect(plan.resolvedPayload?.limit).toBe(10);

    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.recommendations).toHaveLength(2);
    expect(data.recommendations[0].id).toBe('r1');
    // Tenant filter is always applied.
    expect(sb.calls.eq.some((c) => c.col === 'tenant_id' && c.val === 't1')).toBe(true);
  });

  test('status filter is applied to query when payload sets it', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendations_for_tenant');
    const sb = freshState();
    const ctx = ctxWith(sb);
    const plan = await reg.handler.plan(ctx, { status: 'approved' });
    expect(plan.resolvedPayload?.status).toBe('approved');

    await reg.handler.execute(ctx, plan);
    // The handler conditionally chains an extra .eq('status', 'approved') —
    // it must show up alongside the tenant_id filter.
    const statusCalls = sb.calls.eq.filter((c) => c.col === 'status');
    expect(statusCalls).toHaveLength(1);
    expect(statusCalls[0]!.val).toBe('approved');
  });

  test('unknown status string is treated as no filter (null)', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendations_for_tenant');
    const sb = freshState();
    const ctx = ctxWith(sb);
    const plan = await reg.handler.plan(ctx, { status: 'bogus' });
    expect(plan.resolvedPayload?.status).toBeNull();

    await reg.handler.execute(ctx, plan);
    expect(sb.calls.eq.some((c) => c.col === 'status')).toBe(false);
  });

  test('limit is clamped into [1, 50]', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendations_for_tenant');

    // Upper clamp.
    let sb = freshState();
    let ctx = ctxWith(sb);
    let plan = await reg.handler.plan(ctx, { limit: 9999 });
    expect(plan.resolvedPayload?.limit).toBe(50);
    await reg.handler.execute(ctx, plan);
    expect(sb.calls.limit).toEqual([50]);

    // Lower fallback — non-positive falls back to default 10.
    sb = freshState();
    ctx = ctxWith(sb);
    plan = await reg.handler.plan(ctx, { limit: 0 });
    expect(plan.resolvedPayload?.limit).toBe(10);

    // Negative also falls back.
    sb = freshState();
    ctx = ctxWith(sb);
    plan = await reg.handler.plan(ctx, { limit: -5 });
    expect(plan.resolvedPayload?.limit).toBe(10);

    // Mid-range honoured.
    sb = freshState();
    ctx = ctxWith(sb);
    plan = await reg.handler.plan(ctx, { limit: 25 });
    expect(plan.resolvedPayload?.limit).toBe(25);
  });

  test('DB error throws growth_read_failed with the message', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendations_for_tenant');
    const sb = freshState({
      listResult: { data: null, error: { message: 'connection refused' } },
    });
    const ctx = ctxWith(sb);
    const plan = await reg.handler.plan(ctx, {});
    await expect(reg.handler.execute(ctx, plan)).rejects.toThrow(
      /growth_read_failed: connection refused/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. growth.recommendation_get
// ---------------------------------------------------------------------------

describe('growth.recommendation_get', () => {
  const UUID = '11111111-1111-1111-1111-111111111111';

  function ctxWith(sb: SbState) {
    return {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(sb),
    };
  }

  test('happy path with a uuid returns the full row', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendation_get');
    const sb = freshState({
      singleResult: {
        data: {
          id: UUID,
          generated_at: '2026-05-10',
          category: 'menu',
          priority: 1,
          title_ro: 'Adaugă desert',
          rationale_ro: 'AOV scade',
          suggested_action_ro: 'Adaugă tiramisu',
          payload: { item: 'tiramisu' },
          auto_action_available: false,
          status: 'pending',
          decided_at: null,
          decided_by: null,
        },
        error: null,
      },
    });
    const ctx = ctxWith(sb);
    const plan = await reg.handler.plan(ctx, { id: UUID });
    expect(plan.resolvedPayload?.id).toBe(UUID);

    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.recommendation).not.toBeNull();
    expect(data.recommendation.id).toBe(UUID);
    expect(data.recommendation.status).toBe('pending');
    // Both id + tenant_id filters must be applied.
    expect(sb.calls.eq.some((c) => c.col === 'id' && c.val === UUID)).toBe(true);
    expect(sb.calls.eq.some((c) => c.col === 'tenant_id' && c.val === 't1')).toBe(true);
  });

  test('invalid uuid throws invalid_payload from plan', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendation_get');
    const ctx = ctxWith(freshState());
    await expect(reg.handler.plan(ctx, { id: 'not-a-uuid' })).rejects.toThrow(
      /invalid_payload/,
    );
  });

  test('missing id throws invalid_payload from plan', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendation_get');
    const ctx = ctxWith(freshState());
    await expect(reg.handler.plan(ctx, {})).rejects.toThrow(/invalid_payload/);
  });

  test('row not found returns { recommendation: null }', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendation_get');
    const sb = freshState({ singleResult: { data: null, error: null } });
    const ctx = ctxWith(sb);
    const plan = await reg.handler.plan(ctx, { id: UUID });
    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.recommendation).toBeNull();
  });

  test('DB error on get throws growth_read_failed', async () => {
    registerGrowthIntents();
    const reg = getHandler('growth.recommendation_get');
    const sb = freshState({
      singleResult: { data: null, error: { message: 'rls denied' } },
    });
    const ctx = ctxWith(sb);
    const plan = await reg.handler.plan(ctx, { id: UUID });
    await expect(reg.handler.execute(ctx, plan)).rejects.toThrow(
      /growth_read_failed: rls denied/,
    );
  });
});
