// Unit tests for the cost-summary aggregator added alongside the
// /dashboard/ai-ceo cost ledger widget. The other helpers in queries.ts
// are integration-tested via the page render path; this file is scoped
// to the one helper that does in-memory aggregation worth pinning.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const adminMock = vi.hoisted(() => ({
  factory: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminMock.factory(),
}));

// Builds a chainable mock that dispatches per-table. `getAgentCostSummary`
// now runs two reads concurrently:
//   admin.from('agent_cost_ledger').select(...).eq(...).gte(...).order(...).limit(...)
//   admin.from('tenants').select(...).eq(...).maybeSingle()
// Both must resolve cleanly for the budget bar to render correctly.
function makeSupabaseMock(args: {
  rows: Array<{ agent_name: string; cost_cents: number | string; created_at: string }>;
  ledgerError?: { message: string } | null;
  tenantSettings?: unknown;
}) {
  const ledgerResult = { data: args.rows, error: args.ledgerError ?? null };
  const tenantResult = { data: { settings: args.tenantSettings ?? null }, error: null };

  const ledgerBuilder: Record<string, unknown> = {};
  const chainLedger = () => ledgerBuilder;
  ledgerBuilder.select = chainLedger;
  ledgerBuilder.eq = chainLedger;
  ledgerBuilder.gte = chainLedger;
  ledgerBuilder.order = chainLedger;
  ledgerBuilder.limit = vi.fn(() => Promise.resolve(ledgerResult));

  const tenantBuilder: Record<string, unknown> = {};
  const chainTenant = () => tenantBuilder;
  tenantBuilder.select = chainTenant;
  tenantBuilder.eq = chainTenant;
  tenantBuilder.maybeSingle = vi.fn(() => Promise.resolve(tenantResult));

  return {
    from: vi.fn((table: string) =>
      table === 'tenants' ? tenantBuilder : ledgerBuilder,
    ),
  };
}

const EMPTY_SUMMARY = {
  totalCents7d: 0,
  totalCents30d: 0,
  totalCentsMtd: 0,
  callCount30d: 0,
  monthlyBudgetCents: 5000,
  byAgent: [],
};

describe('getAgentCostSummary', () => {
  beforeEach(() => {
    adminMock.factory.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero-valued summary when there are no ledger rows', async () => {
    adminMock.factory.mockReturnValue(makeSupabaseMock({ rows: [] }));
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out).toEqual(EMPTY_SUMMARY);
  });

  it('sums cost_cents across 30d and partitions the last 7 days correctly', async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    adminMock.factory.mockReturnValue(
      makeSupabaseMock({
        rows: [
          // within 7 days
          { agent_name: 'menu', cost_cents: 12.5, created_at: new Date(now - 1 * day).toISOString() },
          { agent_name: 'menu', cost_cents: 7.25, created_at: new Date(now - 3 * day).toISOString() },
          // within 30 days but outside 7
          { agent_name: 'ops', cost_cents: 100, created_at: new Date(now - 15 * day).toISOString() },
          { agent_name: 'growth', cost_cents: 50, created_at: new Date(now - 25 * day).toISOString() },
        ],
      }),
    );
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out.totalCents7d).toBeCloseTo(19.75, 4);
    expect(out.totalCents30d).toBeCloseTo(169.75, 4);
    expect(out.callCount30d).toBe(4);
  });

  it('groups by agent and sorts descending by 30d cost', async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    adminMock.factory.mockReturnValue(
      makeSupabaseMock({
        rows: [
          { agent_name: 'menu', cost_cents: 5, created_at: new Date(now - 2 * day).toISOString() },
          { agent_name: 'ops', cost_cents: 200, created_at: new Date(now - 2 * day).toISOString() },
          { agent_name: 'menu', cost_cents: 10, created_at: new Date(now - 2 * day).toISOString() },
          { agent_name: 'growth', cost_cents: 50, created_at: new Date(now - 2 * day).toISOString() },
        ],
      }),
    );
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out.byAgent.map((a) => a.agent)).toEqual(['ops', 'growth', 'menu']);
    expect(out.byAgent.find((a) => a.agent === 'menu')).toEqual({
      agent: 'menu',
      cents30d: 15,
      calls30d: 2,
    });
  });

  it('returns zero summary on read error (graceful degradation)', async () => {
    adminMock.factory.mockReturnValue(
      makeSupabaseMock({ rows: [], ledgerError: { message: 'rls_denied' } }),
    );
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out).toEqual(EMPTY_SUMMARY);
  });

  it('returns zero summary if the client constructor throws', async () => {
    adminMock.factory.mockImplementation(() => {
      throw new Error('boom');
    });
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out).toEqual(EMPTY_SUMMARY);
  });

  it('coerces string-typed cost_cents (PostgREST numeric → string) to number', async () => {
    const now = Date.now();
    adminMock.factory.mockReturnValue(
      makeSupabaseMock({
        rows: [
          // cost_cents typed as string deliberately — PostgREST returns
          // numeric(10,4) as JSON string when the precision exceeds Number's
          // safe range. The aggregator must coerce.
          { agent_name: 'menu', cost_cents: '3.75', created_at: new Date(now - 1 * 86400000).toISOString() },
        ],
      }),
    );
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out.totalCents30d).toBeCloseTo(3.75, 4);
  });

  // Budget + MTD tests
  it('resolves monthly_budget_cents from tenants.settings.ai when set', async () => {
    adminMock.factory.mockReturnValue(
      makeSupabaseMock({
        rows: [],
        tenantSettings: { ai: { monthly_budget_cents: 12000 } },
      }),
    );
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out.monthlyBudgetCents).toBe(12000);
  });

  it('falls back to DEFAULT_MONTHLY_BUDGET_CENTS when settings missing', async () => {
    adminMock.factory.mockReturnValue(
      makeSupabaseMock({ rows: [], tenantSettings: null }),
    );
    const { getAgentCostSummary, DEFAULT_MONTHLY_BUDGET_CENTS } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out.monthlyBudgetCents).toBe(DEFAULT_MONTHLY_BUDGET_CENTS);
  });

  it('falls back to default when monthly_budget_cents is 0 or negative', async () => {
    adminMock.factory.mockReturnValue(
      makeSupabaseMock({
        rows: [],
        tenantSettings: { ai: { monthly_budget_cents: 0 } },
      }),
    );
    const { getAgentCostSummary, DEFAULT_MONTHLY_BUDGET_CENTS } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out.monthlyBudgetCents).toBe(DEFAULT_MONTHLY_BUDGET_CENTS);
  });

  it('counts current-month rows in totalCentsMtd (only this month)', async () => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const insideMtd = new Date(firstOfMonth.getTime() + 60 * 1000); // 1 min into month
    const beforeMonthStart = new Date(firstOfMonth.getTime() - 60 * 1000); // 1 min before month started

    // Make sure both rows are within the 30-day window so they're returned by the
    // ledger query — we want to test the MTD partition specifically.
    adminMock.factory.mockReturnValue(
      makeSupabaseMock({
        rows: [
          { agent_name: 'menu', cost_cents: 100, created_at: insideMtd.toISOString() },
          { agent_name: 'menu', cost_cents: 50, created_at: beforeMonthStart.toISOString() },
        ],
      }),
    );
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out.totalCentsMtd).toBe(100);
    // totalCents30d should still include both rows.
    expect(out.totalCents30d).toBe(150);
  });
});
