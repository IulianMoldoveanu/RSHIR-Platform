// Tests for the AI Master Orchestrator type/registry mirror plus the
// revert-window helper. The canonical dispatcher lives in
// `supabase/functions/_shared/master-orchestrator.ts` (Deno) — vitest
// runs in Node, so we test the Node-side mirror + the pure helpers
// reachable from this app.
//
// Drift guard: if a sub-agent registers a new intent in the Deno file
// without updating the mirror, the unit test for KNOWN_INTENTS won't
// catch it directly (we can't import the .ts under supabase/functions/
// because the test runner only scans src/), but the type union of
// AgentName protects against typos and the integration smoke (Sprint 13)
// will catch missing entries by asserting `listIntents().length` from
// production.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, beforeEach } from 'vitest';
import {
  KNOWN_INTENTS,
  TRUST_CATEGORIES,
  TRUST_LEVEL_LABELS,
  RUN_STATE_LABELS,
} from './master-orchestrator-types';
// Direct import of the canonical dispatcher (pure TS, Deno-compatible
// but no Deno globals, so vitest in Node loads it fine).
import {
  registerIntent,
  dispatchIntent,
  clearRegistryForTesting,
  type IntentHandler,
} from '../../../../../supabase/functions/_shared/master-orchestrator';

// Drift guard: parse the canonical Deno-side dispatcher source as text and
// extract the set of intent names from its KNOWN_INTENTS literal. The
// admin-side mirror (this file's import) MUST cover the same set. If a
// sub-agent registers a new intent in `_shared/master-orchestrator.ts`
// without updating the mirror, this test fails.
function readDenoSideIntentNames(): Set<string> {
  // Resolve from this file's location up to repo root, independent of
  // how vitest sets process.cwd. This file is at
  // apps/restaurant-admin/src/lib/ai/master-orchestrator.test.ts → repo
  // root is 5 levels up.
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, '..', '..', '..', '..', '..');
  const path = join(repoRoot, 'supabase', 'functions', '_shared', 'master-orchestrator.ts');
  const src = readFileSync(path, 'utf8');
  const start = src.indexOf('export const KNOWN_INTENTS');
  if (start < 0) throw new Error('KNOWN_INTENTS not found in Deno-side source');
  const end = src.indexOf('];', start);
  if (end < 0) throw new Error('KNOWN_INTENTS terminator not found');
  const block = src.slice(start, end);
  const names = new Set<string>();
  for (const m of block.matchAll(/name:\s*'([^']+)'/g)) {
    names.add(m[1]!);
  }
  return names;
}

describe('KNOWN_INTENTS drift guard', () => {
  test('admin-side mirror covers the Deno-side authoritative list', () => {
    const denoNames = readDenoSideIntentNames();
    const adminNames = new Set(KNOWN_INTENTS.map((i) => i.name));
    const missingFromAdmin = [...denoNames].filter((n) => !adminNames.has(n));
    const extraInAdmin = [...adminNames].filter((n) => !denoNames.has(n));
    expect(missingFromAdmin).toEqual([]);
    expect(extraInAdmin).toEqual([]);
  });
});

describe('KNOWN_INTENTS', () => {
  test('every entry has a non-empty name and agent', () => {
    for (const i of KNOWN_INTENTS) {
      expect(i.name.length).toBeGreaterThan(0);
      expect(i.agent.length).toBeGreaterThan(0);
      expect(i.defaultCategory.length).toBeGreaterThan(0);
      expect(i.description.length).toBeGreaterThan(0);
    }
  });

  test('intent names are unique', () => {
    const seen = new Set<string>();
    for (const i of KNOWN_INTENTS) {
      expect(seen.has(i.name)).toBe(false);
      seen.add(i.name);
    }
  });

  test('every intent uses a known agent', () => {
    const known = new Set([
      'master',
      'menu',
      'marketing',
      'ops',
      'cs',
      'analytics',
      'finance',
      'compliance',
      'growth',
    ]);
    for (const i of KNOWN_INTENTS) {
      expect(known.has(i.agent)).toBe(true);
    }
  });
});

describe('TRUST_CATEGORIES', () => {
  test('every (agent, category) pair is unique', () => {
    const seen = new Set<string>();
    for (const c of TRUST_CATEGORIES) {
      const key = `${c.agent}|${c.category}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('destructive categories are explicitly marked', () => {
    // Tripwire: changing a known destructive category to non-destructive
    // requires an explicit code review. These names are the contract with
    // the dispatcher's hard-guard.
    const destructiveCategories = TRUST_CATEGORIES.filter((c) => c.destructive).map(
      (c) => `${c.agent}.${c.category}`,
    );
    expect(destructiveCategories).toContain('menu.price.change');
    expect(destructiveCategories).toContain('menu.item.delete');
    expect(destructiveCategories).toContain('cs.reservation.cancel');
    expect(destructiveCategories).toContain('finance.refund.issue');
    expect(destructiveCategories).toContain('ops.hours.change');
  });
});

describe('TRUST_LEVEL_LABELS', () => {
  test('exactly 3 trust levels', () => {
    expect(Object.keys(TRUST_LEVEL_LABELS)).toHaveLength(3);
    expect(TRUST_LEVEL_LABELS.PROPOSE_ONLY).toBeTruthy();
    expect(TRUST_LEVEL_LABELS.AUTO_REVERSIBLE).toBeTruthy();
    expect(TRUST_LEVEL_LABELS.AUTO_FULL).toBeTruthy();
  });
});

describe('RUN_STATE_LABELS', () => {
  test('covers all 4 lifecycle states', () => {
    expect(RUN_STATE_LABELS.PROPOSED).toBeTruthy();
    expect(RUN_STATE_LABELS.EXECUTED).toBeTruthy();
    expect(RUN_STATE_LABELS.REVERTED).toBeTruthy();
    expect(RUN_STATE_LABELS.REJECTED).toBeTruthy();
  });
});

// Pure helper, copy-tested. The production version lives in
// `lib/ai/activity-queries.ts`; if it changes, this test must be updated.
const REVERT_WINDOW_MS = 24 * 60 * 60 * 1000;

function computeCanRevert(row: {
  state: string | null;
  reverted_at: string | null;
  pre_state: unknown;
  created_at: string | null;
}): boolean {
  if (row.state !== 'EXECUTED') return false;
  if (row.reverted_at) return false;
  if (!row.pre_state || typeof row.pre_state !== 'object') return false;
  if (Object.keys(row.pre_state as Record<string, unknown>).length === 0) return false;
  if (!row.created_at) return false;
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (Number.isNaN(ageMs)) return false;
  return ageMs <= REVERT_WINDOW_MS;
}

describe('canRevert window', () => {
  const justNow = new Date().toISOString();
  const halfDayAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  test('returns true for a fresh EXECUTED row with pre_state', () => {
    expect(
      computeCanRevert({
        state: 'EXECUTED',
        reverted_at: null,
        pre_state: { foo: 'bar' },
        created_at: justNow,
      }),
    ).toBe(true);
  });

  test('returns false when not EXECUTED', () => {
    for (const s of ['PROPOSED', 'REVERTED', 'REJECTED', null]) {
      expect(
        computeCanRevert({
          state: s,
          reverted_at: null,
          pre_state: { foo: 'bar' },
          created_at: justNow,
        }),
      ).toBe(false);
    }
  });

  test('returns false when already reverted', () => {
    expect(
      computeCanRevert({
        state: 'EXECUTED',
        reverted_at: justNow,
        pre_state: { foo: 'bar' },
        created_at: justNow,
      }),
    ).toBe(false);
  });

  test('returns false when pre_state is empty/null', () => {
    expect(
      computeCanRevert({
        state: 'EXECUTED',
        reverted_at: null,
        pre_state: {},
        created_at: justNow,
      }),
    ).toBe(false);
    expect(
      computeCanRevert({
        state: 'EXECUTED',
        reverted_at: null,
        pre_state: null,
        created_at: justNow,
      }),
    ).toBe(false);
  });

  test('returns true within 24h', () => {
    expect(
      computeCanRevert({
        state: 'EXECUTED',
        reverted_at: null,
        pre_state: { x: 1 },
        created_at: halfDayAgo,
      }),
    ).toBe(true);
  });

  test('returns false past 24h', () => {
    expect(
      computeCanRevert({
        state: 'EXECUTED',
        reverted_at: null,
        pre_state: { x: 1 },
        created_at: twoDaysAgo,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dispatcher trust-gate tests — directly exercises dispatchIntent() with a
// mock Supabase client. CRITICAL: confirms the Codex P1 fix — a
// PROPOSE_ONLY write intent must NOT call execute() before the gate.
// ---------------------------------------------------------------------------

type MockSb = {
  trustRows: Array<{
    restaurant_id: string;
    agent_name: string;
    action_category: string;
    trust_level: 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';
    is_destructive: boolean;
  }>;
  insertedRuns: Array<Record<string, unknown>>;
};

function makeMockSupabase(state: MockSb) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from(table: string) {
      if (table === 'agent_trust_calibration') {
        return {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              eq: (_c2: string, _v2: string) => ({
                eq: (_c3: string, _v3: string) => ({
                  maybeSingle: async () => {
                    const r = state.trustRows[0] ?? null;
                    return { data: r, error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'copilot_agent_runs') {
        return {
          insert: (row: Record<string, unknown>) => {
            state.insertedRuns.push(row);
            return {
              select: () => ({
                maybeSingle: async () => ({ data: { id: 'run-' + state.insertedRuns.length }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error('unmocked table: ' + table);
    },
  };
}

describe('dispatchIntent — trust gate ordering (Codex P1 fix)', () => {
  beforeEach(() => clearRegistryForTesting());

  test('PROPOSE_ONLY write intent does NOT call execute() — gate runs after plan, before execute', async () => {
    let planCalls = 0;
    let executeCalls = 0;
    const handler: IntentHandler = {
      plan: async () => {
        planCalls++;
        return {
          actionCategory: 'description.update',
          summary: 'Actualizez descrierea pentru X',
          preState: { description: 'old' },
          resolvedPayload: { item_id: 1, new: 'better' },
        };
      },
      execute: async () => {
        executeCalls++;
        return { summary: 'done', data: { ok: true } };
      },
    };
    registerIntent({
      name: 'menu.description_update',
      agent: 'menu',
      defaultCategory: 'description.update',
      description: 't',
      handler,
    });

    const state: MockSb = {
      trustRows: [
        {
          restaurant_id: 't1',
          agent_name: 'menu',
          action_category: 'description.update',
          trust_level: 'PROPOSE_ONLY',
          is_destructive: false,
        },
      ],
      insertedRuns: [],
    };
    const sb = makeMockSupabase(state);

    const r = await dispatchIntent(sb, {
      tenantId: 't1',
      channel: 'telegram',
      intent: 'menu.description_update',
      payload: {},
    });

    expect(planCalls).toBe(1);
    // The CRITICAL assertion: execute must NOT have been called.
    expect(executeCalls).toBe(0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toBe('PROPOSED');
    // Ledger row written with state PROPOSED.
    expect(state.insertedRuns).toHaveLength(1);
    expect(state.insertedRuns[0]!.state).toBe('PROPOSED');
  });

  test('AUTO_REVERSIBLE write intent DOES call execute()', async () => {
    let executeCalls = 0;
    registerIntent({
      name: 'menu.description_update',
      agent: 'menu',
      defaultCategory: 'description.update',
      description: 't',
      handler: {
        plan: async () => ({
          actionCategory: 'description.update',
          summary: 'plan',
          preState: { description: 'old' },
        }),
        execute: async () => {
          executeCalls++;
          return { summary: 'executed', data: { ok: true } };
        },
      },
    });

    const state: MockSb = {
      trustRows: [
        {
          restaurant_id: 't1',
          agent_name: 'menu',
          action_category: 'description.update',
          trust_level: 'AUTO_REVERSIBLE',
          is_destructive: false,
        },
      ],
      insertedRuns: [],
    };
    const r = await dispatchIntent(makeMockSupabase(state), {
      tenantId: 't1',
      channel: 'telegram',
      intent: 'menu.description_update',
      payload: {},
    });

    expect(executeCalls).toBe(1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toBe('EXECUTED');
    expect(state.insertedRuns[0]!.state).toBe('EXECUTED');
  });

  test('readOnly intent bypasses trust gate entirely', async () => {
    let executeCalls = 0;
    registerIntent({
      name: 'analytics.summary',
      agent: 'analytics',
      defaultCategory: 'analytics.read',
      description: 't',
      readOnly: true,
      handler: {
        plan: async () => ({ actionCategory: 'analytics.read', summary: 'plan' }),
        execute: async () => {
          executeCalls++;
          return { summary: 'data', data: { orders: 5 } };
        },
      },
    });

    // Even with PROPOSE_ONLY in the DB, readOnly bypasses.
    const state: MockSb = {
      trustRows: [
        {
          restaurant_id: 't1',
          agent_name: 'analytics',
          action_category: 'analytics.read',
          trust_level: 'PROPOSE_ONLY',
          is_destructive: false,
        },
      ],
      insertedRuns: [],
    };
    const r = await dispatchIntent(makeMockSupabase(state), {
      tenantId: 't1',
      channel: 'telegram',
      intent: 'analytics.summary',
      payload: {},
    });

    expect(executeCalls).toBe(1);
    if (r.ok) expect(r.state).toBe('EXECUTED');
  });

  test('destructive flag forces PROPOSED even when trust_level=AUTO_FULL', async () => {
    let executeCalls = 0;
    registerIntent({
      name: 'menu.price_change',
      agent: 'menu',
      defaultCategory: 'price.change',
      description: 't',
      handler: {
        plan: async () => ({
          actionCategory: 'price.change',
          summary: 'plan',
          preState: { price: 10 },
        }),
        execute: async () => {
          executeCalls++;
          return { summary: 'done', data: {} };
        },
      },
    });

    const state: MockSb = {
      trustRows: [
        {
          restaurant_id: 't1',
          agent_name: 'menu',
          action_category: 'price.change',
          trust_level: 'AUTO_FULL', // owner tried to escalate
          is_destructive: true, // but DB says destructive
        },
      ],
      insertedRuns: [],
    };
    const r = await dispatchIntent(makeMockSupabase(state), {
      tenantId: 't1',
      channel: 'telegram',
      intent: 'menu.price_change',
      payload: {},
    });

    // Destructive guard wins: ledger goes to PROPOSED, execute not called.
    expect(executeCalls).toBe(0);
    if (r.ok) expect(r.state).toBe('PROPOSED');
  });

  test('unknown intent returns error', async () => {
    const state: MockSb = { trustRows: [], insertedRuns: [] };
    const r = await dispatchIntent(makeMockSupabase(state), {
      tenantId: 't1',
      channel: 'telegram',
      intent: 'does.not.exist',
      payload: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown_intent');
  });
});
