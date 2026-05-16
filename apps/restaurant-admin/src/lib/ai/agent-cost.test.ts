// HIR F6 — tests for the agent cost ledger helper.
//
// The helper itself lives in supabase/functions/_shared/agent-cost.ts (Deno).
// Vitest loads it directly because it's pure TS with no Deno globals at
// the top level (the `Deno.env.get` lookup is gated behind a runtime
// `globalThis.Deno?.env` check so Node imports succeed).
//
// We test:
//   1) computeCostCents() — pricing math for each known model, plus the
//      unknown-model fallback (0).
//   2) recordCost() — happy path with a fake Supabase client, plus the
//      feature-flag no-op branch.
//   3) checkBudget() — happy (under budget), over-limit, no-budget default
//      ($50), and disabled-flag short-circuit.
//   4) Integration with the dispatcher — over-budget tenant gets
//      PROPOSED + reason 'budget_exhausted'; master agent bypass.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  computeCostCents,
  recordCost,
  checkBudget,
  extractAnthropicUsage,
} from '../../../../../supabase/functions/_shared/agent-cost';
import {
  registerIntent,
  dispatchIntent,
  clearRegistryForTesting,
  type IntentHandler,
} from '../../../../../supabase/functions/_shared/master-orchestrator';

// ----- 1) cost math -----

describe('computeCostCents', () => {
  test('sonnet 4.5 dated suffix: 1M in / 1M out = $18.00 = 1800c', () => {
    const cents = computeCostCents('claude-sonnet-4-5-20250929', 1_000_000, 1_000_000);
    expect(cents).toBeCloseTo(300 + 1500, 4); // $3 + $15 = $18 → 1800c
  });

  test('haiku 4.5: 1M in / 1M out = $0.80 + $4.00 = $4.80 = 480c', () => {
    const cents = computeCostCents('claude-haiku-4-5-20251001', 1_000_000, 1_000_000);
    expect(cents).toBeCloseTo(80 + 400, 4);
  });

  test('text-embedding-3-small: 1M in / 0 out = $0.02 = 2c', () => {
    expect(computeCostCents('text-embedding-3-small', 1_000_000, 0)).toBeCloseTo(2, 6);
  });

  test('text-embedding-3-small ignores output tokens (no output pricing)', () => {
    expect(computeCostCents('text-embedding-3-small', 1_000_000, 999_999)).toBeCloseTo(2, 6);
  });

  test('unknown model → 0', () => {
    expect(computeCostCents('gpt-4-turbo', 1_000_000, 1_000_000)).toBe(0);
  });

  test('empty model → 0', () => {
    expect(computeCostCents('', 1_000_000, 1_000_000)).toBe(0);
  });

  test('small token counts produce small but non-zero cents', () => {
    // 1,000 input tokens of sonnet = 1000/1M × $3 × 100c = 0.3c
    expect(computeCostCents('claude-sonnet-4-5', 1000, 0)).toBeCloseTo(0.3, 6);
  });
});

// ----- 2) extractAnthropicUsage -----

describe('extractAnthropicUsage', () => {
  test('returns 0/0 for empty/missing body', () => {
    expect(extractAnthropicUsage(null)).toEqual({ input_tokens: 0, output_tokens: 0 });
    expect(extractAnthropicUsage({})).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  test('reads input_tokens + output_tokens from usage', () => {
    expect(
      extractAnthropicUsage({ usage: { input_tokens: 42, output_tokens: 17 } }),
    ).toEqual({ input_tokens: 42, output_tokens: 17 });
  });

  test('clamps negative values to 0', () => {
    expect(
      extractAnthropicUsage({ usage: { input_tokens: -5, output_tokens: -1 } }),
    ).toEqual({ input_tokens: 0, output_tokens: 0 });
  });
});

// ----- fake Supabase client -----

type Insert = { table: string; row: Record<string, unknown> };

function makeFakeSupabase(opts: {
  budgetCents?: number | null; // null → no settings.ai key
  monthlySpendCents?: number;  // sum returned for current-month select
  failInsert?: boolean;
}) {
  const inserts: Insert[] = [];
  const fake = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return Promise.resolve({
            error: opts.failInsert ? { message: 'fake_insert_failed' } : null,
          });
        },
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                maybeSingle() {
                  if (table !== 'tenants') return Promise.resolve({ data: null });
                  if (opts.budgetCents === null) return Promise.resolve({ data: { settings: {} } });
                  return Promise.resolve({
                    data: { settings: { ai: { monthly_budget_cents: opts.budgetCents ?? 5000 } } },
                  });
                },
                gte(_col2: string, _val2: string) {
                  // sum query for ledger
                  return Promise.resolve({
                    data: [{ cost_cents: opts.monthlySpendCents ?? 0 }],
                    error: null,
                  });
                },
              };
            },
            in(_col: string, _vals: unknown[]) {
              return Promise.resolve({ data: [] });
            },
          };
        },
      };
    },
  };
  return { fake, inserts };
}

// ----- 3) recordCost -----

describe('recordCost', () => {
  beforeEach(() => { delete process.env.COST_LEDGER_ENABLED; });
  afterEach(() => { delete process.env.COST_LEDGER_ENABLED; });

  test('inserts a ledger row with computed cost', async () => {
    const { fake, inserts } = makeFakeSupabase({});
    await recordCost(fake, {
      tenantId: 'tnt-1',
      agentName: 'growth',
      model: 'claude-sonnet-4-5',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe('agent_cost_ledger');
    expect(inserts[0].row.tenant_id).toBe('tnt-1');
    expect(inserts[0].row.agent_name).toBe('growth');
    expect(Number(inserts[0].row.cost_cents)).toBeCloseTo(1800, 4);
  });

  test('no-op when COST_LEDGER_ENABLED=false', async () => {
    process.env.COST_LEDGER_ENABLED = 'false';
    const { fake, inserts } = makeFakeSupabase({});
    await recordCost(fake, {
      tenantId: 'tnt-1',
      agentName: 'growth',
      model: 'claude-sonnet-4-5',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(inserts).toHaveLength(0);
  });

  test('zero tokens → cost_cents 0 (mock-first, no fake usage)', async () => {
    const { fake, inserts } = makeFakeSupabase({});
    await recordCost(fake, {
      tenantId: 'tnt-1',
      agentName: 'growth',
      model: 'claude-sonnet-4-5',
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(Number(inserts[0].row.cost_cents)).toBe(0);
  });

  test('swallows insert errors (never throws)', async () => {
    const { fake } = makeFakeSupabase({ failInsert: true });
    await expect(
      recordCost(fake, {
        tenantId: 'tnt-1',
        agentName: 'growth',
        model: 'claude-sonnet-4-5',
        inputTokens: 100,
        outputTokens: 50,
      }),
    ).resolves.toBeUndefined();
  });
});

// ----- 4) checkBudget -----

describe('checkBudget', () => {
  beforeEach(() => { delete process.env.COST_LEDGER_ENABLED; });
  afterEach(() => { delete process.env.COST_LEDGER_ENABLED; });

  test('under-budget → ok:true', async () => {
    const { fake } = makeFakeSupabase({ budgetCents: 5000, monthlySpendCents: 1000 });
    const r = await checkBudget(fake, 'tnt-1');
    expect(r.ok).toBe(true);
    expect(r.used).toBe(1000);
    expect(r.limit).toBe(5000);
  });

  test('over-budget → ok:false', async () => {
    const { fake } = makeFakeSupabase({ budgetCents: 5000, monthlySpendCents: 6000 });
    const r = await checkBudget(fake, 'tnt-1');
    expect(r.ok).toBe(false);
    expect(r.used).toBe(6000);
    expect(r.limit).toBe(5000);
  });

  test('at-budget (equal) → ok:false (>= comparison)', async () => {
    const { fake } = makeFakeSupabase({ budgetCents: 5000, monthlySpendCents: 5000 });
    const r = await checkBudget(fake, 'tnt-1');
    expect(r.ok).toBe(false);
  });

  test('no settings.ai key → default $50 = 5000c', async () => {
    const { fake } = makeFakeSupabase({ budgetCents: null, monthlySpendCents: 1000 });
    const r = await checkBudget(fake, 'tnt-1');
    expect(r.limit).toBe(5000);
    expect(r.ok).toBe(true);
  });

  test('disabled flag → ok:true with Infinity limit', async () => {
    process.env.COST_LEDGER_ENABLED = 'false';
    const { fake } = makeFakeSupabase({ budgetCents: 100, monthlySpendCents: 999_999 });
    const r = await checkBudget(fake, 'tnt-1');
    expect(r.ok).toBe(true);
    expect(r.limit).toBe(Number.POSITIVE_INFINITY);
  });
});

// ----- 5) dispatcher integration: budget gate -----

function makeDispatcherFakeSupabase(opts: { spendCents: number; budgetCents: number }) {
  // Used by checkBudget (reads tenants.settings, then agent_cost_ledger sum)
  // AND by writeLedger (inserts into copilot_agent_runs).
  const calls: Array<{ table: string; op: string; row?: unknown }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fake: any = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ table, op: 'insert', row });
          return {
            select(_c: string) {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: { id: 'run-fake' }, error: null });
                },
              };
            },
          };
        },
        select(_cols: string) {
          return {
            eq(_c: string, _v: unknown) {
              return {
                eq(_c2: string, _v2: unknown) {
                  return {
                    eq(_c3: string, _v3: unknown) {
                      return {
                        maybeSingle() {
                          return Promise.resolve({ data: null, error: null });
                        },
                      };
                    },
                  };
                },
                maybeSingle() {
                  return Promise.resolve({
                    data: { settings: { ai: { monthly_budget_cents: opts.budgetCents } } },
                    error: null,
                  });
                },
                gte(_c2: string, _v2: string) {
                  return Promise.resolve({
                    data: [{ cost_cents: opts.spendCents }],
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  return { fake, calls };
}

function registerEchoIntent(name: string, agent: 'growth' | 'master', readOnly = false) {
  const handler: IntentHandler = {
    plan: async (_ctx, payload) => ({
      actionCategory: 'echo',
      summary: 'echo plan',
      resolvedPayload: payload,
    }),
    execute: async () => ({ summary: 'echo executed', data: { ok: true } }),
  };
  registerIntent({
    name,
    agent,
    defaultCategory: 'echo',
    description: 'test echo intent',
    readOnly,
    handler,
  });
}

describe('dispatchIntent — F6 budget gate', () => {
  beforeEach(() => {
    clearRegistryForTesting();
    delete process.env.COST_LEDGER_ENABLED;
  });
  afterEach(() => {
    clearRegistryForTesting();
    delete process.env.COST_LEDGER_ENABLED;
  });

  test('under budget: non-master agent executes normally', async () => {
    registerEchoIntent('growth.echo', 'growth', /*readOnly*/ true);
    const { fake } = makeDispatcherFakeSupabase({ spendCents: 100, budgetCents: 5000 });
    const r = await dispatchIntent(fake, {
      tenantId: 'tnt-1',
      channel: 'web',
      intent: 'growth.echo',
      payload: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.state === 'EXECUTED') {
      expect(r.data).toEqual({ ok: true });
    } else {
      throw new Error(`expected EXECUTED, got ${JSON.stringify(r)}`);
    }
  });

  test('over budget: non-master agent returns PROPOSED + budget_exhausted', async () => {
    registerEchoIntent('growth.echo', 'growth', /*readOnly*/ true);
    const { fake } = makeDispatcherFakeSupabase({ spendCents: 9999, budgetCents: 5000 });
    const r = await dispatchIntent(fake, {
      tenantId: 'tnt-1',
      channel: 'web',
      intent: 'growth.echo',
      payload: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.state === 'PROPOSED') {
      expect(r.reason).toBe('budget_exhausted');
    } else {
      throw new Error(`expected PROPOSED, got ${JSON.stringify(r)}`);
    }
  });

  test('over budget: master agent bypasses the gate', async () => {
    registerEchoIntent('master.echo', 'master', /*readOnly*/ true);
    const { fake } = makeDispatcherFakeSupabase({ spendCents: 9999, budgetCents: 5000 });
    const r = await dispatchIntent(fake, {
      tenantId: 'tnt-1',
      channel: 'web',
      intent: 'master.echo',
      payload: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.state === 'EXECUTED') {
      expect(r.data).toEqual({ ok: true });
    } else {
      throw new Error(`expected EXECUTED for master, got ${JSON.stringify(r)}`);
    }
  });

  test('flag disabled: over-budget agent still executes', async () => {
    process.env.COST_LEDGER_ENABLED = 'false';
    registerEchoIntent('growth.echo', 'growth', /*readOnly*/ true);
    const { fake } = makeDispatcherFakeSupabase({ spendCents: 9999, budgetCents: 5000 });
    const r = await dispatchIntent(fake, {
      tenantId: 'tnt-1',
      channel: 'web',
      intent: 'growth.echo',
      payload: {},
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.state).toBe('EXECUTED');
  });
});
