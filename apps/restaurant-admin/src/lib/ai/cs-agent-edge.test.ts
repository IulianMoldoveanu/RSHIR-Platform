// CS Agent (Deno-side) — unit tests for RSHIR Wave 3 Lane 1.
//
// Verifies the six intents register correctly + each handler's plan/execute
// contract. Anthropic + Supabase are mocked at the client + fetch level so
// we never hit the network.
//
// Coverage map:
//   1. Registration — all 6 intents land in the registry with right agent.
//   2. cs.reservation_create — plan validates payload; execute inserts row.
//   3. cs.reservation_list — read-only window query returns split upcoming/past.
//   4. cs.reservation_cancel — plan reads pre-state; execute flips to CANCELLED.
//   5. cs.review_reply_draft — LLM mocked → parsed reply persisted as DRAFT.
//   6. cs.complaint_template — deterministic template per known category.
//   7. cs.feedback_digest — aggregates reviews + complaints.
//   8. assertNotAutoPostingNegative — defense-in-depth guard.
//
// Placement deviation from spec: spec called for the test at
// `supabase/functions/_shared/cs-agent.test.ts`, but the repo's vitest config
// (apps/restaurant-admin/vitest.config.ts) only globs
// `src/**/*.test.ts`. The marketing + analytics edge tests already live
// under `apps/restaurant-admin/src/lib/ai/` for this reason — we mirror.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  clearRegistryForTesting,
  dispatchIntent,
  listIntents,
} from '../../../../../supabase/functions/_shared/master-orchestrator';
import {
  __TESTING__,
  __resetRegisteredForTesting,
  assertNotAutoPostingNegative,
  registerCsIntents,
  setFetchForTesting,
  COMPLAINT_TYPES,
} from '../../../../../supabase/functions/_shared/cs-agent';

// ---------------------------------------------------------------------------
// Mock Supabase — same shape as marketing-agent.test.ts.
// ---------------------------------------------------------------------------

type SbState = {
  // reservation_settings row
  resSettings: {
    is_enabled: boolean;
    party_size_max: number;
    slot_duration_min: number;
    capacity_per_slot: number;
    advance_min_minutes: number;
    advance_max_days: number;
  } | null;
  // reservations rows the lookup returns
  reservationsByQuery: Array<Record<string, unknown>>;
  // single-row lookup for reservation_cancel pre-state
  reservationLookup: Record<string, unknown> | null;
  // reviews + cs_agent_responses rows for digest
  reviews: Array<{ rating: number; comment: string | null; created_at: string }>;
  complaints: Array<{ source_id: string | null; created_at: string }>;
  trustRows: Array<{
    restaurant_id: string;
    agent_name: string;
    action_category: string;
    trust_level: 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';
    is_destructive: boolean;
  }>;
  inserted: Array<{ table: string; row: Record<string, unknown> }>;
  updated: Array<{ table: string; row: Record<string, unknown> }>;
};

function freshState(overrides: Partial<SbState> = {}): SbState {
  return {
    resSettings: {
      is_enabled: true,
      party_size_max: 12,
      slot_duration_min: 90,
      capacity_per_slot: 4,
      advance_min_minutes: 60,
      advance_max_days: 30,
    },
    reservationsByQuery: [],
    reservationLookup: null,
    reviews: [],
    complaints: [],
    trustRows: [],
    inserted: [],
    updated: [],
    ...overrides,
  };
}

// Lightweight chainable builder helper. We hand-craft per-table chains to
// match exactly the calls the agent makes — over-mocking generic Postgrest
// becomes a maintenance burden.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMockSb(state: SbState): any {
  return {
    from(table: string) {
      if (table === 'reservation_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.resSettings, error: null }),
            }),
          }),
        };
      }
      if (table === 'reservations') {
        return {
          // INSERT path (create)
          insert: (row: Record<string, unknown>) => {
            state.inserted.push({ table, row });
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'res-1',
                    public_track_token: 'tok-1',
                    status: 'REQUESTED',
                  },
                  error: null,
                }),
              }),
            };
          },
          // SELECT path with various filter chains
          select: () => ({
            // lookup-by-id chain (cancel pre-state)
            eq: () => ({
              maybeSingle: async () => ({ data: state.reservationLookup, error: null }),
              // list chain — eq().gte().lte().order()
              gte: () => ({
                lte: () => ({
                  order: () => ({
                    // emulate "thenable" — actually just await it
                    then: (cb: (v: { data: unknown; error: null }) => unknown) =>
                      Promise.resolve({ data: state.reservationsByQuery, error: null }).then(cb),
                  }),
                }),
              }),
            }),
          }),
          // UPDATE path (cancel)
          update: (row: Record<string, unknown>) => {
            state.updated.push({ table, row });
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { id: 'res-1', status: 'CANCELLED' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === 'cs_agent_responses') {
        return {
          insert: (row: Record<string, unknown>) => {
            state.inserted.push({ table, row });
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: `draft-${state.inserted.filter((r) => r.table === 'cs_agent_responses').length}` },
                  error: null,
                }),
              }),
            };
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: async () => ({ data: state.complaints, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'restaurant_reviews') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                order: async () => ({ data: state.reviews, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'tenant_agent_trust') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: state.trustRows[0] ?? null, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'copilot_agent_runs') {
        return {
          insert: (row: Record<string, unknown>) => {
            state.inserted.push({ table, row });
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: 'run-' + state.inserted.length },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      throw new Error('unmocked table: ' + table);
    },
  };
}

const realFetch = globalThis.fetch;
function restoreFetch() {
  globalThis.fetch = realFetch;
  setFetchForTesting(null);
}

function installDenoEnv(env: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
}

beforeEach(() => {
  clearRegistryForTesting();
  __resetRegisteredForTesting();
});

afterEach(() => {
  clearRegistryForTesting();
  __resetRegisteredForTesting();
  restoreFetch();
});

// ---------------------------------------------------------------------------
// 1. Registration
// ---------------------------------------------------------------------------

describe('cs-agent / registration', () => {
  test('registers all 6 intents idempotently under agent=cs', () => {
    registerCsIntents();
    registerCsIntents(); // dedup guard
    const names = listIntents()
      .filter((i) => i.agent === 'cs')
      .map((i) => i.name)
      .sort();
    expect(names).toEqual([
      'cs.complaint_template',
      'cs.feedback_digest',
      'cs.reservation_cancel',
      'cs.reservation_create',
      'cs.reservation_list',
      'cs.review_reply_draft',
    ]);
  });

  test('read-only intents are marked readOnly:true', () => {
    registerCsIntents();
    const byName = Object.fromEntries(listIntents().map((i) => [i.name, i]));
    expect(byName['cs.reservation_list']?.readOnly).toBe(true);
    expect(byName['cs.complaint_template']?.readOnly).toBe(true);
    expect(byName['cs.feedback_digest']?.readOnly).toBe(true);
    expect(byName['cs.review_reply_draft']?.readOnly).toBe(true);
    // Writes:
    expect(byName['cs.reservation_create']?.readOnly).toBeFalsy();
    expect(byName['cs.reservation_cancel']?.readOnly).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// 2. cs.reservation_create
// ---------------------------------------------------------------------------

describe('cs.reservation_create', () => {
  test('plan validates payload and execute inserts a reservation row', async () => {
    const sb = freshState();
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(sb),
    };
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const plan = await __TESTING__.reservationCreateHandler.plan(ctx, {
      customer_first_name: 'Ioana',
      customer_phone: '+40700000000',
      party_size: 4,
      requested_at_iso: future,
    });
    expect(plan.actionCategory).toBe('reservation.create');
    expect(plan.resolvedPayload?.party_size).toBe(4);

    const result = await __TESTING__.reservationCreateHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.reservation_id).toBe('res-1');
    expect(data.status).toBe('REQUESTED');

    const inserts = sb.inserted.filter((r) => r.table === 'reservations');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.row.customer_first_name).toBe('Ioana');
    expect(inserts[0]!.row.party_size).toBe(4);
    expect(inserts[0]!.row.status).toBe('REQUESTED');
  });

  test('plan throws on missing required fields', async () => {
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(freshState()),
    };
    await expect(
      __TESTING__.reservationCreateHandler.plan(ctx, { customer_phone: '+40700' }),
    ).rejects.toThrow(/invalid_payload/);
  });

  test('plan throws on bad requested_at_iso', async () => {
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(freshState()),
    };
    await expect(
      __TESTING__.reservationCreateHandler.plan(ctx, {
        customer_first_name: 'X',
        customer_phone: '+40',
        party_size: 2,
        requested_at_iso: 'not-a-date',
      }),
    ).rejects.toThrow(/invalid_payload/);
  });
});

// ---------------------------------------------------------------------------
// 3. cs.reservation_list (read-only)
// ---------------------------------------------------------------------------

describe('cs.reservation_list', () => {
  test('splits rows into upcoming + past based on requested_at vs now', async () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const sb = freshState({
      reservationsByQuery: [
        { id: 'a', requested_at: past, status: 'COMPLETED', customer_first_name: 'A', party_size: 2 },
        { id: 'b', requested_at: future, status: 'CONFIRMED', customer_first_name: 'B', party_size: 3 },
      ],
    });
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(sb),
    };
    const plan = await __TESTING__.reservationListHandler.plan(ctx, {});
    const result = await __TESTING__.reservationListHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.upcoming).toHaveLength(1);
    expect(data.past).toHaveLength(1);
    expect(data.upcoming[0].id).toBe('b');
    expect(data.past[0].id).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// 4. cs.reservation_cancel
// ---------------------------------------------------------------------------

describe('cs.reservation_cancel', () => {
  test('plan captures pre_state then execute flips status to CANCELLED', async () => {
    const sb = freshState({
      reservationLookup: {
        id: 'res-1',
        tenant_id: 't1',
        status: 'REQUESTED',
        customer_first_name: 'Ana',
        requested_at: new Date().toISOString(),
      },
    });
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(sb),
    };
    const plan = await __TESTING__.reservationCancelHandler.plan(ctx, {
      reservation_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(plan.preState).toEqual({ status: 'REQUESTED' });
    expect(plan.actionCategory).toBe('reservation.cancel');

    const result = await __TESTING__.reservationCancelHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.status).toBe('CANCELLED');
    const updates = sb.updated.filter((r) => r.table === 'reservations');
    expect(updates).toHaveLength(1);
    expect(updates[0]!.row.status).toBe('CANCELLED');
  });

  test('plan throws when reservation belongs to another tenant', async () => {
    const sb = freshState({
      reservationLookup: {
        id: 'res-x',
        tenant_id: 'OTHER_TENANT',
        status: 'REQUESTED',
        customer_first_name: 'X',
        requested_at: new Date().toISOString(),
      },
    });
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(sb),
    };
    await expect(
      __TESTING__.reservationCancelHandler.plan(ctx, {
        reservation_id: '11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toThrow(/reservation_tenant_mismatch/);
  });

  test('plan throws when reservation_id is not a uuid', async () => {
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(freshState()),
    };
    await expect(
      __TESTING__.reservationCancelHandler.plan(ctx, { reservation_id: 'not-a-uuid' }),
    ).rejects.toThrow(/invalid_payload/);
  });
});

// ---------------------------------------------------------------------------
// 5. cs.review_reply_draft (LLM call mocked)
// ---------------------------------------------------------------------------

describe('cs.review_reply_draft', () => {
  test('execute calls Anthropic, parses JSON, persists draft row', async () => {
    installDenoEnv({ ANTHROPIC_API_KEY: 'sk-test' });
    const replyText =
      'Stimată Doamnă, vă mulțumim sincer pentru aprecierea timpurie. Suntem onorați că ați ales restaurantul nostru și vă așteptăm din nou cu drag.';
    setFetchForTesting(
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify({ reply: replyText, sentiment: 'positive', confidence: 0.9 }) }],
            usage: { input_tokens: 200, output_tokens: 80 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any,
    );

    const sb = freshState();
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(sb),
    };
    const plan = await __TESTING__.reviewReplyDraftHandler.plan(ctx, {
      review_text: 'Mâncare excelentă, recomand cu drag!',
      rating: 5,
      tenant_name: 'Foișorul A',
    });
    expect(plan.actionCategory).toBe('review.reply');
    expect(plan.resolvedPayload?.rating).toBe(5);

    const result = await __TESTING__.reviewReplyDraftHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.reply).toBe(replyText);
    expect(data.sentiment).toBe('positive');
    expect(data.auto_post).toBe(false);

    const drafts = sb.inserted.filter((r) => r.table === 'cs_agent_responses');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.row.intent).toBe('review_reply');
    expect(drafts[0]!.row.status).toBe('DRAFT');
  });

  test('plan rejects rating outside 1..5', async () => {
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(freshState()),
    };
    await expect(
      __TESTING__.reviewReplyDraftHandler.plan(ctx, { review_text: 'Bună!', rating: 9 }),
    ).rejects.toThrow(/invalid_payload/);
  });
});

// ---------------------------------------------------------------------------
// 6. cs.complaint_template (deterministic, no LLM)
// ---------------------------------------------------------------------------

describe('cs.complaint_template', () => {
  test('returns templated apology + corrective action + compensation for late_delivery', async () => {
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(freshState()),
    };
    const plan = await __TESTING__.complaintTemplateHandler.plan(ctx, {
      category: 'late_delivery',
      customer_first_name: 'Mihai',
    });
    const result = await __TESTING__.complaintTemplateHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.category).toBe('late_delivery');
    expect(data.suggested_compensation).toMatch(/15%/);
    expect(data.text).toMatch(/Mihai/);
    expect(data.text).toMatch(/întârziere/i);
  });

  test('plan throws on unknown category', async () => {
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(freshState()),
    };
    await expect(
      __TESTING__.complaintTemplateHandler.plan(ctx, { category: 'bogus_cat' }),
    ).rejects.toThrow(/invalid_payload/);
  });

  test('all known COMPLAINT_TYPES have a template entry', () => {
    for (const c of COMPLAINT_TYPES) {
      expect(__TESTING__.COMPLAINT_TEMPLATES[c]).toBeTruthy();
      expect(__TESTING__.COMPLAINT_TEMPLATES[c].apology.length).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. cs.feedback_digest
// ---------------------------------------------------------------------------

describe('cs.feedback_digest', () => {
  test('aggregates 30d reviews + complaints into bucketed summary', async () => {
    const sb = freshState({
      reviews: [
        { rating: 5, comment: 'Bun', created_at: new Date().toISOString() },
        { rating: 4, comment: null, created_at: new Date().toISOString() },
        { rating: 2, comment: 'Rece', created_at: new Date().toISOString() },
      ],
      complaints: [
        { source_id: 'late_delivery', created_at: new Date().toISOString() },
        { source_id: 'late_delivery', created_at: new Date().toISOString() },
        { source_id: 'cold_food', created_at: new Date().toISOString() },
      ],
    });
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(sb),
    };
    const plan = await __TESTING__.feedbackDigestHandler.plan(ctx, {});
    const result = await __TESTING__.feedbackDigestHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.reviews_count).toBe(3);
    expect(data.average_rating).toBeCloseTo((5 + 4 + 2) / 3, 2);
    expect(data.breakdown).toEqual({ negative: 1, neutral: 0, positive: 2 });
    expect(data.complaints_count).toBe(3);
    expect(data.complaints_by_category.late_delivery).toBe(2);
    expect(data.complaints_by_category.cold_food).toBe(1);
  });

  test('empty-state returns avg=null + zero counts', async () => {
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      supabase: makeMockSb(freshState()),
    };
    const plan = await __TESTING__.feedbackDigestHandler.plan(ctx, {});
    const result = await __TESTING__.feedbackDigestHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.reviews_count).toBe(0);
    expect(data.average_rating).toBeNull();
    expect(data.complaints_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. assertNotAutoPostingNegative guard
// ---------------------------------------------------------------------------

describe('assertNotAutoPostingNegative', () => {
  test('does nothing under PROPOSE_ONLY (OWNER is in the loop)', () => {
    expect(() =>
      assertNotAutoPostingNegative({ rating: 1, sentiment: 'negative', trustLevel: 'PROPOSE_ONLY' }),
    ).not.toThrow();
  });

  test('throws when AUTO_FULL + rating <= 3', () => {
    expect(() =>
      assertNotAutoPostingNegative({ rating: 2, sentiment: 'positive', trustLevel: 'AUTO_FULL' }),
    ).toThrow(/cs_auto_post_negative_blocked/);
  });

  test('throws when AUTO_REVERSIBLE + negative sentiment regardless of rating', () => {
    expect(() =>
      assertNotAutoPostingNegative({ rating: 5, sentiment: 'negative', trustLevel: 'AUTO_REVERSIBLE' }),
    ).toThrow(/cs_auto_post_negative_blocked/);
  });

  test('allows AUTO_FULL + 4-5 star + positive sentiment', () => {
    expect(() =>
      assertNotAutoPostingNegative({ rating: 5, sentiment: 'positive', trustLevel: 'AUTO_FULL' }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 9. Dispatcher integration (read-only intent end-to-end)
// ---------------------------------------------------------------------------

describe('cs-agent / dispatcher integration', () => {
  test('cs.reservation_list flows through dispatchIntent as EXECUTED (readOnly bypasses trust)', async () => {
    registerCsIntents();
    const sb = freshState({ reservationsByQuery: [] });
    const result = await dispatchIntent(makeMockSb(sb), {
      tenantId: 't1',
      channel: 'web',
      intent: 'cs.reservation_list',
      payload: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toBe('EXECUTED');
    const ledger = sb.inserted.filter((r) => r.table === 'copilot_agent_runs');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.row.state).toBe('EXECUTED');
    expect(ledger[0]!.row.agent_name).toBe('cs');
  });
});
