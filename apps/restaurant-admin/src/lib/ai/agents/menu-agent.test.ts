// Menu Agent — Sprint 12 unit tests.
//
// Coverage map (per lane brief: 5+ cases):
//   1. plan() is pure — propose_new_item plan does not call Anthropic or
//      mutate Supabase, just validates input shape.
//   2. plan() rejects invalid input — empty seed throws.
//   3. execute() writes a DRAFT proposal row to menu_agent_proposals when
//      Anthropic returns valid JSON.
//   4. execute() enforces the daily cap — 5 invocations in 24h blocks the
//      6th and records a 'capped' invocation row.
//   5. execute() guards against item_id hallucination — if Anthropic
//      returns a different item_id than the input, the call throws
//      (defense-in-depth).
//   6. End-to-end via dispatchIntent: readOnly:true intents EXECUTE under
//      PROPOSE_ONLY trust (the agent's create-DRAFT semantic is not gated).
//   7. Mirror parity: KNOWN_INTENTS of master orchestrator includes the
//      menu intent placeholders the Sprint 12 PR registers.
//
// We don't hit the live Anthropic API. The Deno-side handler reads the API
// key from Deno.env.get() — vitest in Node runs the same TS file but
// (a) we stub fetch via setFetchForTesting(), and (b) we set Deno.env in
// globalThis so getApiKey() returns a fake.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  dispatchIntent,
  clearRegistryForTesting,
} from '../../../../../../supabase/functions/_shared/master-orchestrator';
import {
  registerMenuAgentIntents,
  setFetchForTesting,
  __TESTING__,
} from '../../../../../../supabase/functions/_shared/menu-agent';
import {
  MENU_INTENT_NAMES,
  proposeNewItemPayloadSchema,
  markSoldOutPayloadSchema,
  draftPromoPayloadSchema,
} from './menu-agent';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type InsertedProposal = {
  tenant_id: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  rationale: string;
  channel: string;
};

type InsertedInvocation = {
  tenant_id: string;
  intent: string;
  outcome: string;
  cost_micro_usd: number | null;
};

type MockState = {
  invocationCount: number;
  insertedProposals: InsertedProposal[];
  insertedInvocations: InsertedInvocation[];
  // Force the menu_agent_invocations select count to a fixed value (for
  // the daily-cap test). When null, returns insertedInvocations.length.
  forcedInvocationCount: number | null;
  proposalInsertId: string;
};

function makeMockSupabase(state: MockState) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: (tableName: string) => {
      if (tableName === 'menu_agent_invocations') {
        // Codex P2 round 2 fix on PR #363: insert-before-count cap
        // accounting (reserveCapSlot). Codex P2 round 1: 'capped' rows
        // excluded from the count. Mock mirrors both.
        const capCount = () =>
          state.forcedInvocationCount != null
            ? state.forcedInvocationCount
            : state.insertedInvocations.filter((r) => r.outcome !== 'capped').length;
        return {
          select: (_cols: string, _opts?: { count?: string; head?: boolean }) => ({
            eq: () => ({
              in: () => ({
                gte: async () => ({ count: capCount(), error: null }),
              }),
              // Backwards-compat: original chain (no .in()) still resolved.
              gte: async () => ({ count: capCount(), error: null }),
            }),
          }),
          // reserveCapSlot inserts then chains .select('id').maybeSingle()
          // to read back the new row's id; finalizeInvocation later
          // .update(...).eq('id', reservationId). The legacy plain
          // recordInvocation calls just `await insert(row)` without .select(),
          // expecting `{error}`.
          insert: (row: InsertedInvocation) => {
            const id = `inv-${state.insertedInvocations.length + 1}`;
            const stored = { ...row, id } as InsertedInvocation & { id: string };
            state.insertedInvocations.push(stored);
            const chained = {
              select: () => ({
                maybeSingle: async () => ({ data: { id }, error: null }),
              }),
              // Make `await insert(row)` resolve to {error: null} too.
              then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
            };
            return chained;
          },
          // reserveCapSlot may update outcome='capped'; finalizeInvocation
          // updates outcome='ok'|'failed' + cost.
          update: (patch: Partial<InsertedInvocation>) => ({
            eq: async (_col: string, id: string) => {
              const row = (state.insertedInvocations as Array<InsertedInvocation & { id?: string }>).find(
                (r) => r.id === id,
              );
              if (row) Object.assign(row, patch);
              return { error: null };
            },
          }),
        };
      }
      if (tableName === 'menu_agent_proposals') {
        return {
          insert: (row: InsertedProposal) => ({
            select: () => ({
              maybeSingle: async () => {
                state.insertedProposals.push(row);
                return { data: { id: state.proposalInsertId }, error: null };
              },
            }),
          }),
        };
      }
      // tenant_agent_trust — used by the dispatcher's resolveTrust.
      // For test #6 we always return a row.
      if (tableName === 'tenant_agent_trust') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      trust_level: 'PROPOSE_ONLY',
                      is_destructive: false,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      // copilot_agent_runs — orchestrator ledger insert.
      if (tableName === 'copilot_agent_runs') {
        return {
          insert: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: 'ledger-row-id' }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${tableName}`);
    },
  };
}

function defaultState(): MockState {
  return {
    invocationCount: 0,
    insertedProposals: [],
    insertedInvocations: [],
    forcedInvocationCount: null,
    proposalInsertId: '11111111-1111-1111-1111-111111111111',
  };
}

// Stub Anthropic with a synchronous JSON response. Each test sets up the
// expected payload before calling execute().
function stubAnthropic(payload: Record<string, unknown>) {
  setFetchForTesting(async () =>
    new Response(
      JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        usage: { input_tokens: 350, output_tokens: 180 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
}

function stubAnthropic500() {
  setFetchForTesting(async () => new Response('upstream', { status: 500 }));
}

beforeEach(() => {
  clearRegistryForTesting();
  // Make Deno.env.get('ANTHROPIC_API_KEY') return a fake key in Node.
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

describe('menu-agent / mirror', () => {
  test('MENU_INTENT_NAMES mirror is non-empty and matches expected names', () => {
    expect(MENU_INTENT_NAMES).toEqual([
      'menu.propose_new_item',
      'menu.mark_sold_out',
      'menu.draft_promo',
    ]);
  });

  test('Zod schemas accept valid payloads + reject obvious violations', () => {
    expect(
      proposeNewItemPayloadSchema.safeParse({
        name: 'Cheesecake',
        description: 'Cu afine',
        price_ron: 25,
        category_hint: 'Deserturi',
        tags: ['dessert'],
      }).success,
    ).toBe(true);
    expect(proposeNewItemPayloadSchema.safeParse({ name: '', description: 'x', price_ron: 0, category_hint: 'X' }).success).toBe(
      false,
    );
    expect(
      markSoldOutPayloadSchema.safeParse({
        item_id: '11111111-1111-1111-1111-111111111111',
        item_name: 'Salata',
        customer_facing_reason: 'Epuizat temporar.',
        until_iso: '2026-05-09T18:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      draftPromoPayloadSchema.safeParse({
        item_id: '11111111-1111-1111-1111-111111111111',
        item_name: 'Pizza',
        discount_pct: 25,
        headline: 'Weekend deal',
        body: 'Reducere weekend.',
        valid_from: '2026-05-09T18:00:00.000Z',
        valid_to: '2026-05-11T22:00:00.000Z',
      }).success,
    ).toBe(true);
    // discount_pct out of range
    expect(
      draftPromoPayloadSchema.safeParse({
        item_id: '11111111-1111-1111-1111-111111111111',
        item_name: 'Pizza',
        discount_pct: 99,
        headline: 'X',
        body: 'X',
        valid_from: '2026-05-09T18:00:00.000Z',
        valid_to: '2026-05-11T22:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('menu-agent / propose_new_item handler', () => {
  test('plan() is pure — does not insert any rows or call Anthropic', async () => {
    const state = defaultState();
    let fetchCalls = 0;
    setFetchForTesting(async () => {
      fetchCalls++;
      return new Response('{}', { status: 200 });
    });

    const plan = await __TESTING__.proposeNewItemHandler.plan(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { tenantId: 't1', channel: 'telegram', actorUserId: null, supabase: makeMockSupabase(state) as any },
      { seed: 'cheesecake de afine' },
    );

    expect(plan.actionCategory).toBe('proposal.create');
    expect(plan.summary).toContain('cheesecake');
    expect(state.insertedProposals).toHaveLength(0);
    expect(state.insertedInvocations).toHaveLength(0);
    expect(fetchCalls).toBe(0);
  });

  test('plan() rejects invalid input — empty seed throws', async () => {
    const state = defaultState();
    await expect(
      __TESTING__.proposeNewItemHandler.plan(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { tenantId: 't1', channel: 'telegram', actorUserId: null, supabase: makeMockSupabase(state) as any },
        { seed: '' },
      ),
    ).rejects.toThrow(/invalid_payload/);
  });

  test('execute() writes a DRAFT proposal row when Anthropic returns valid JSON', async () => {
    const state = defaultState();
    stubAnthropic({
      name: 'Cheesecake de afine',
      description: 'Tort fin cu afine, blat de biscuiți, 180g per porție.',
      price_ron: 28,
      category_hint: 'Deserturi',
      tags: ['dessert', 'fruit'],
    });

    const ctx = {
      tenantId: 't1',
      channel: 'telegram' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.proposeNewItemHandler.plan(ctx, { seed: 'cheesecake de afine' });
    const result = await __TESTING__.proposeNewItemHandler.execute(ctx, plan);

    expect(state.insertedProposals).toHaveLength(1);
    expect(state.insertedProposals[0]!.kind).toBe('new_item');
    expect(state.insertedProposals[0]!.status).toBe('DRAFT');
    expect(state.insertedProposals[0]!.payload).toMatchObject({
      name: 'Cheesecake de afine',
      price_ron: 28,
      category_hint: 'Deserturi',
    });
    expect(result.summary).toContain('Cheesecake');
    // Invocation logged as 'ok' with cost.
    expect(state.insertedInvocations).toHaveLength(1);
    expect(state.insertedInvocations[0]!.outcome).toBe('ok');
    expect(state.insertedInvocations[0]!.cost_micro_usd).toBeGreaterThan(0);
  });

  test('execute() enforces daily cap via insert-before-count reservation — 6 (5 prior + 1 reserved) > cap blocks', async () => {
    const state = defaultState();
    // Codex P2 round 2 fix on PR #363: cap accounting now uses
    // insert-before-count. The mock SELECT returns the forced count
    // value AFTER the reservation insert. A 6th attempt sees post-insert
    // count = 6 > DAILY_INVOCATION_CAP (5) → reservation rewritten as
    // 'capped', execute() throws daily_cap_reached.
    state.forcedInvocationCount = 6;
    stubAnthropic({
      name: 'X',
      description: 'X',
      price_ron: 10,
      category_hint: 'X',
      tags: [],
    });

    const ctx = {
      tenantId: 't1',
      channel: 'telegram' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.proposeNewItemHandler.plan(ctx, { seed: 'orice' });
    await expect(__TESTING__.proposeNewItemHandler.execute(ctx, plan)).rejects.toThrow(
      /daily_cap_reached/,
    );
    // Reservation row was inserted then rewritten as 'capped'.
    expect(state.insertedProposals).toHaveLength(0);
    expect(state.insertedInvocations).toHaveLength(1);
    expect(state.insertedInvocations[0]!.outcome).toBe('capped');
  });
});

describe('menu-agent / cap reservation — Anthropic is NOT called when capped', () => {
  test('reserveCapSlot blocks Anthropic call when post-insert count exceeds cap (Codex P2 round 2 fix)', async () => {
    const state = defaultState();
    state.forcedInvocationCount = 7; // post-insert count > cap
    let fetchCalls = 0;
    setFetchForTesting(async () => {
      fetchCalls++;
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '{}' }],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
        { status: 200 },
      );
    });

    const ctx = {
      tenantId: 't1',
      channel: 'telegram' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.proposeNewItemHandler.plan(ctx, { seed: 'cheesecake' });
    await expect(__TESTING__.proposeNewItemHandler.execute(ctx, plan)).rejects.toThrow(
      /daily_cap_reached/,
    );
    // Anthropic must not have been called — the cap reservation aborted
    // before the upstream call.
    expect(fetchCalls).toBe(0);
    expect(state.insertedProposals).toHaveLength(0);
    expect(state.insertedInvocations[0]!.outcome).toBe('capped');
  });
});

describe('menu-agent / cap accounting — capped rows do not extend lockout', () => {
  test('execute() lets a fresh attempt through when the only prior rows are capped (Codex P2 #1 fix)', async () => {
    const state = defaultState();
    // Seed 5 prior 'capped' rows — these MUST NOT count toward the cap.
    for (let i = 0; i < 5; i++) {
      state.insertedInvocations.push({
        tenant_id: 't1',
        intent: 'menu.propose_new_item',
        outcome: 'capped',
        cost_micro_usd: null,
      });
    }
    stubAnthropic({
      name: 'X',
      description: 'Y',
      price_ron: 10,
      category_hint: 'Z',
      tags: [],
    });
    const ctx = {
      tenantId: 't1',
      channel: 'telegram' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.proposeNewItemHandler.plan(ctx, { seed: 'orice' });
    // This must NOT throw daily_cap_reached — capped rows are excluded.
    const result = await __TESTING__.proposeNewItemHandler.execute(ctx, plan);
    expect(result.summary).toContain('X');
    expect(state.insertedProposals).toHaveLength(1);
    // Last invocation logged is 'ok' (the new attempt), not 'capped'.
    const last = state.insertedInvocations[state.insertedInvocations.length - 1]!;
    expect(last.outcome).toBe('ok');
  });
});

describe('menu-agent / sold_out — item_id hallucination guard', () => {
  test('execute() throws when Anthropic returns a different item_id than input (defense-in-depth)', async () => {
    const state = defaultState();
    // Anthropic responds with a hallucinated item_id (different from input).
    stubAnthropic({
      item_id: '99999999-9999-9999-9999-999999999999',
      item_name: 'Salata Caesar',
      customer_facing_reason: 'Epuizat temporar.',
      until_iso: '2026-05-09T18:00:00.000Z',
    });

    const ctx = {
      tenantId: 't1',
      channel: 'telegram' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.markSoldOutHandler.plan(ctx, {
      item_id: '11111111-1111-1111-1111-111111111111',
      item_name: 'Salata Caesar',
      reason: '',
      until_iso: '2026-05-09T18:00:00.000Z',
    });
    await expect(__TESTING__.markSoldOutHandler.execute(ctx, plan)).rejects.toThrow(
      /item_id_mismatch/,
    );
    expect(state.insertedProposals).toHaveLength(0);
    // Invocation logged as failed.
    expect(state.insertedInvocations).toHaveLength(1);
    expect(state.insertedInvocations[0]!.outcome).toBe('failed');
  });
});

describe('menu-agent / draft_promo — promo window guard', () => {
  test('execute() rejects a promo where valid_from >= valid_to', async () => {
    const state = defaultState();
    stubAnthropic({
      item_id: '11111111-1111-1111-1111-111111111111',
      item_name: 'Pizza',
      discount_pct: 25,
      headline: 'X',
      body: 'X',
      valid_from: '2026-05-11T22:00:00.000Z', // AFTER valid_to
      valid_to: '2026-05-09T18:00:00.000Z',
    });

    const ctx = {
      tenantId: 't1',
      channel: 'telegram' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.draftPromoHandler.plan(ctx, {
      item_id: '11111111-1111-1111-1111-111111111111',
      item_name: 'Pizza',
      item_price_ron: 30,
      brief: 'weekend',
    });
    await expect(__TESTING__.draftPromoHandler.execute(ctx, plan)).rejects.toThrow(/promo window/);
  });
});

describe('menu-agent / dispatchIntent end-to-end', () => {
  test('readOnly intents EXECUTE through the dispatcher even under PROPOSE_ONLY trust', async () => {
    const state = defaultState();
    stubAnthropic({
      name: 'Burger',
      description: 'Burger clasic.',
      price_ron: 32,
      category_hint: 'Burgeri',
      tags: [],
    });

    registerMenuAgentIntents();

    const r = await dispatchIntent(makeMockSupabase(state), {
      tenantId: 't1',
      channel: 'telegram',
      intent: 'menu.propose_new_item',
      payload: { seed: 'burger clasic' },
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state).toBe('EXECUTED');
    }
    // Proposal row inserted.
    expect(state.insertedProposals).toHaveLength(1);
    expect(state.insertedProposals[0]!.kind).toBe('new_item');
  });
});

describe('menu-agent / Anthropic upstream error', () => {
  test('execute() records failed invocation and propagates error when Anthropic returns 5xx', async () => {
    const state = defaultState();
    stubAnthropic500();

    const ctx = {
      tenantId: 't1',
      channel: 'telegram' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.proposeNewItemHandler.plan(ctx, { seed: 'orice' });
    await expect(__TESTING__.proposeNewItemHandler.execute(ctx, plan)).rejects.toThrow();
    expect(state.insertedProposals).toHaveLength(0);
    expect(state.insertedInvocations).toHaveLength(1);
    expect(state.insertedInvocations[0]!.outcome).toBe('failed');
  });
});
