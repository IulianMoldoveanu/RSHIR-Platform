// Marketing Agent V1 — unit tests
//
// Verifies the registration into the Master Orchestrator + the pure
// helpers reachable from Node. Anthropic + Supabase are mocked at the
// supabase-client + global fetch level; we don't actually hit the network.
//
// The dispatcher itself is exercised in master-orchestrator.test.ts; here
// we focus on the agent-specific contract:
//
//  1. Both intents register (drift guard against KNOWN_INTENTS list).
//  2. Plan is pure — no DB writes, no LLM call.
//  3. Sanitiser drops drafts containing forbidden terms.
//  4. pickPostType behaves on weather + weekday signals.
//  5. publish_post intent throws not_implemented_v1 from execute().

import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  registerIntent,
  dispatchIntent,
  clearRegistryForTesting,
  listIntents,
} from '../../../../../supabase/functions/_shared/master-orchestrator';
import {
  registerMarketingAgent,
  __resetRegisteredForTesting,
  pickPostType,
  sanitizeDraft,
} from '../../../../../supabase/functions/_shared/marketing-agent';

// ---------------------------------------------------------------------------
// Mock Supabase — tracks what tables were touched + what got inserted.
// Mirrors the lightweight mock from master-orchestrator.test.ts.
// ---------------------------------------------------------------------------

type SbState = {
  tenant: { id: string; name: string; cuisine_types: string[]; city_id: string | null };
  city: { id: string; name: string } | null;
  topItems: Array<{ name: string; revenue: number }> | null;
  weather: { temp_c: number | null; weather_code: number | null; weather_desc: string | null } | null;
  trustRows: Array<{
    restaurant_id: string;
    agent_name: string;
    action_category: string;
    trust_level: 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';
    is_destructive: boolean;
  }>;
  inserted: Array<{ table: string; row: Record<string, unknown> }>;
};

function makeMockSb(state: SbState) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from(table: string) {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.tenant, error: null }) }),
          }),
        };
      }
      if (table === 'cities') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.city, error: null }) }),
          }),
        };
      }
      if (table === 'mv_growth_tenant_metrics_30d') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.topItems ? { top_items: state.topItems } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'weather_snapshots') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: state.weather, error: null }),
                }),
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
                maybeSingle: async () => ({ data: { id: 'run-' + state.inserted.length }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'marketing_drafts') {
        return {
          insert: (row: Record<string, unknown>) => {
            state.inserted.push({ table, row });
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: 'draft-' + state.inserted.filter((r) => r.table === 'marketing_drafts').length },
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

function freshState(overrides: Partial<SbState> = {}): SbState {
  return {
    tenant: { id: 't1', name: 'Foișorul A', cuisine_types: ['italian'], city_id: 'city-bv' },
    city: { id: 'city-bv', name: 'Brașov' },
    topItems: [{ name: 'Pizza Margherita', revenue: 1234 }],
    weather: { temp_c: 12, weather_code: 500, weather_desc: 'rain' },
    trustRows: [],
    inserted: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Anthropic fetch mock — returns canned Sonnet responses.
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;

function mockAnthropic(body: unknown, status = 200) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = vi.fn(async (url: any) => {
    if (typeof url === 'string' && url.includes('api.anthropic.com')) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error('unmocked fetch: ' + url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

// Set the env Deno.env.get reads — vitest runs Node so we shim a Deno
// global the agent code can call into. Has to be installed before
// importing the module under test, but the module reads via getter at
// call time so a per-test setup also works.
function installDenoEnv(env: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Deno = {
    env: { get: (k: string) => env[k] },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Marketing Agent — registration', () => {
  beforeEach(() => {
    clearRegistryForTesting();
    __resetRegisteredForTesting();
  });

  test('registers both marketing intents idempotently', () => {
    registerMarketingAgent();
    registerMarketingAgent(); // second call is a no-op
    const names = listIntents().map((i) => i.name);
    expect(names).toContain('marketing.draft_post');
    expect(names).toContain('marketing.publish_post');
  });

  test('registered intents declare the marketing agent', () => {
    registerMarketingAgent();
    const drafted = listIntents().find((i) => i.name === 'marketing.draft_post');
    expect(drafted?.agent).toBe('marketing');
    expect(drafted?.defaultCategory).toBe('social.draft');
  });
});

describe('Marketing Agent — sanitizeDraft', () => {
  test('drops drafts that mention "fleet"', () => {
    expect(
      sanitizeDraft({
        body_ro: 'Comandați azi cu echipa noastră fleet rapidă!',
      }),
    ).toBeNull();
  });

  test('drops drafts that mention "subcontractor"', () => {
    expect(
      sanitizeDraft({
        body_ro: 'Curierii noștri sunt subcontractori siguri.',
      }),
    ).toBeNull();
  });

  test('drops drafts that mention "broker"', () => {
    expect(
      sanitizeDraft({
        headline_ro: 'Broker logistica',
        body_ro: 'Text ok',
      }),
    ).toBeNull();
  });

  test('accepts a clean draft and trims fields', () => {
    const long = 'a'.repeat(700);
    const out = sanitizeDraft({
      headline_ro: 'Comandați pizza astăzi',
      body_ro: long,
      hashtags: '#brașov #pizza',
      cta_ro: 'Comandați acum',
    });
    expect(out).not.toBeNull();
    expect(out!.body_ro.length).toBeLessThanOrEqual(600);
    expect(out!.headline_ro).toBe('Comandați pizza astăzi');
  });

  test('rejects drafts with empty body', () => {
    expect(sanitizeDraft({ body_ro: '' })).toBeNull();
    expect(sanitizeDraft({ body_ro: '   ' })).toBeNull();
  });
});

describe('Marketing Agent — pickPostType', () => {
  test('promo on rain (weather code 500)', () => {
    expect(
      pickPostType({
        tenant_name: 't',
        cuisine_types: [],
        city_id: null,
        city_name: null,
        top_items: [],
        weather: { temp_c: 12, weather_code: 500, weather_desc: 'rain' },
        weekday: 3,
      }),
    ).toBe('promo');
  });

  test('promo on heat (>=28°C)', () => {
    expect(
      pickPostType({
        tenant_name: 't',
        cuisine_types: [],
        city_id: null,
        city_name: null,
        top_items: [],
        weather: { temp_c: 31, weather_code: 800, weather_desc: 'clear' },
        weekday: 3,
      }),
    ).toBe('promo');
  });

  test('engagement on Friday with mild clear weather', () => {
    expect(
      pickPostType({
        tenant_name: 't',
        cuisine_types: [],
        city_id: null,
        city_name: null,
        top_items: [],
        weather: { temp_c: 20, weather_code: 800, weather_desc: 'clear' },
        weekday: 5,
      }),
    ).toBe('engagement');
  });

  test('promo as default fallback', () => {
    expect(
      pickPostType({
        tenant_name: 't',
        cuisine_types: [],
        city_id: null,
        city_name: null,
        top_items: [],
        weather: null,
        weekday: 2,
      }),
    ).toBe('promo');
  });
});

describe('Marketing Agent — dispatcher integration', () => {
  beforeEach(() => {
    clearRegistryForTesting();
    __resetRegisteredForTesting();
    registerMarketingAgent();
  });

  test('PROPOSE_ONLY trust → no LLM call, no draft inserted, ledger row PROPOSED', async () => {
    installDenoEnv({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL_SONNET: 'claude-sonnet-4-5-20250929' });
    // If anything tries to call Anthropic, fail loudly.
    globalThis.fetch = vi.fn(async () => {
      throw new Error('LLM should not be called under PROPOSE_ONLY');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const sb = freshState({
      trustRows: [
        {
          restaurant_id: 't1',
          agent_name: 'marketing',
          action_category: 'social.draft',
          trust_level: 'PROPOSE_ONLY',
          is_destructive: false,
        },
      ],
    });

    const result = await dispatchIntent(makeMockSb(sb), {
      tenantId: 't1',
      channel: 'web',
      intent: 'marketing.draft_post',
      payload: { brief_ro: 'pizza weekend' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toBe('PROPOSED');
    // No marketing_drafts insert.
    expect(sb.inserted.filter((r) => r.table === 'marketing_drafts')).toHaveLength(0);
    // One ledger row, state PROPOSED.
    const ledger = sb.inserted.filter((r) => r.table === 'copilot_agent_runs');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.row.state).toBe('PROPOSED');
    restoreFetch();
  });

  test('AUTO_REVERSIBLE trust → LLM called, sanitised draft inserted, EXECUTED ledger', async () => {
    installDenoEnv({ ANTHROPIC_API_KEY: 'sk-test' });
    mockAnthropic({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            headline_ro: 'Pizza de weekend',
            body_ro: 'Vă invităm să comandați pizza astăzi. Echipa noastră de livrare ajunge rapid în Brașov.',
            hashtags: '#brașov #pizza #weekend',
            cta_ro: 'Comandați acum',
            rationale_ro: 'Plouă + top item pizza',
          }),
        },
      ],
      usage: { input_tokens: 500, output_tokens: 150 },
    });
    const sb = freshState({
      trustRows: [
        {
          restaurant_id: 't1',
          agent_name: 'marketing',
          action_category: 'social.draft',
          trust_level: 'AUTO_REVERSIBLE',
          is_destructive: false,
        },
      ],
    });

    const result = await dispatchIntent(makeMockSb(sb), {
      tenantId: 't1',
      channel: 'web',
      intent: 'marketing.draft_post',
      payload: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toBe('EXECUTED');
    const drafts = sb.inserted.filter((r) => r.table === 'marketing_drafts');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.row.body_ro).toContain('comandați pizza');
    expect(drafts[0]!.row.platform).toBe('facebook');
    expect(drafts[0]!.row.status).toBe('draft');
    // Ledger row EXECUTED.
    const ledger = sb.inserted.filter((r) => r.table === 'copilot_agent_runs');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.row.state).toBe('EXECUTED');
    restoreFetch();
  });

  test('LLM returns forbidden term → no draft inserted, EXECUTED row with rejection summary', async () => {
    installDenoEnv({ ANTHROPIC_API_KEY: 'sk-test' });
    mockAnthropic({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            body_ro: 'Echipa noastră fleet livrează rapid!',
          }),
        },
      ],
      usage: { input_tokens: 300, output_tokens: 50 },
    });
    const sb = freshState({
      trustRows: [
        {
          restaurant_id: 't1',
          agent_name: 'marketing',
          action_category: 'social.draft',
          trust_level: 'AUTO_REVERSIBLE',
          is_destructive: false,
        },
      ],
    });

    const result = await dispatchIntent(makeMockSb(sb), {
      tenantId: 't1',
      channel: 'web',
      intent: 'marketing.draft_post',
      payload: {},
    });

    expect(result.ok).toBe(true);
    // No draft persisted.
    expect(sb.inserted.filter((r) => r.table === 'marketing_drafts')).toHaveLength(0);
    // Ledger row written, summary mentions filter rejection.
    const ledger = sb.inserted.filter((r) => r.table === 'copilot_agent_runs');
    expect(ledger).toHaveLength(1);
    expect(String(ledger[0]!.row.summary)).toMatch(/respins/);
    restoreFetch();
  });

  test('publish_post throws not_implemented_v1 from execute()', async () => {
    installDenoEnv({ ANTHROPIC_API_KEY: 'sk-test' });
    const sb = freshState({
      trustRows: [
        {
          restaurant_id: 't1',
          agent_name: 'marketing',
          action_category: 'social.publish',
          trust_level: 'AUTO_REVERSIBLE',
          is_destructive: false,
        },
      ],
    });

    const result = await dispatchIntent(makeMockSb(sb), {
      tenantId: 't1',
      channel: 'web',
      intent: 'marketing.publish_post',
      payload: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('handler_threw');
      expect(result.message).toMatch(/not_implemented_v1/);
    }
  });
});
