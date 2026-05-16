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

// Builds a chainable mock that returns the supplied rows on the terminal
// await. Mirrors the surface shape `getAgentCostSummary` calls:
//   admin.from(...).select(...).eq(...).gte(...).order(...).limit(...) → Promise<{data,error}>
function makeSupabaseMock(
  rows: Array<{ agent_name: string; cost_cents: number; created_at: string }>,
  error: { message: string } | null = null,
) {
  const builder: Record<string, unknown> = {};
  const result = { data: rows, error };
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.gte = chain;
  builder.order = chain;
  builder.limit = vi.fn(() => Promise.resolve(result));
  // The chain must end at `limit()` which returns a Promise — so we make
  // `limit` thenable by wrapping its return value. Vitest's Promise.resolve
  // already handles this.
  return { from: vi.fn(() => builder) };
}

describe('getAgentCostSummary', () => {
  beforeEach(() => {
    adminMock.factory.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero-valued summary when there are no ledger rows', async () => {
    adminMock.factory.mockReturnValue(makeSupabaseMock([]));
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out).toEqual({
      totalCents7d: 0,
      totalCents30d: 0,
      callCount30d: 0,
      byAgent: [],
    });
  });

  it('sums cost_cents across 30d and partitions the last 7 days correctly', async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    adminMock.factory.mockReturnValue(
      makeSupabaseMock([
        // within 7 days
        { agent_name: 'menu', cost_cents: 12.5, created_at: new Date(now - 1 * day).toISOString() },
        { agent_name: 'menu', cost_cents: 7.25, created_at: new Date(now - 3 * day).toISOString() },
        // within 30 days but outside 7
        { agent_name: 'ops', cost_cents: 100, created_at: new Date(now - 15 * day).toISOString() },
        { agent_name: 'growth', cost_cents: 50, created_at: new Date(now - 25 * day).toISOString() },
      ]),
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
      makeSupabaseMock([
        { agent_name: 'menu', cost_cents: 5, created_at: new Date(now - 2 * day).toISOString() },
        { agent_name: 'ops', cost_cents: 200, created_at: new Date(now - 2 * day).toISOString() },
        { agent_name: 'menu', cost_cents: 10, created_at: new Date(now - 2 * day).toISOString() },
        { agent_name: 'growth', cost_cents: 50, created_at: new Date(now - 2 * day).toISOString() },
      ]),
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
      makeSupabaseMock([], { message: 'rls_denied' }),
    );
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out).toEqual({
      totalCents7d: 0,
      totalCents30d: 0,
      callCount30d: 0,
      byAgent: [],
    });
  });

  it('returns zero summary if the client constructor throws', async () => {
    adminMock.factory.mockImplementation(() => {
      throw new Error('boom');
    });
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out).toEqual({
      totalCents7d: 0,
      totalCents30d: 0,
      callCount30d: 0,
      byAgent: [],
    });
  });

  it('coerces string-typed cost_cents (PostgREST numeric → string) to number', async () => {
    const now = Date.now();
    adminMock.factory.mockReturnValue(
      makeSupabaseMock([
        // cost_cents typed as string deliberately — PostgREST returns
        // numeric(10,4) as JSON string when the precision exceeds Number's
        // safe range. The aggregator must coerce.
        { agent_name: 'menu', cost_cents: '3.75' as unknown as number, created_at: new Date(now - 1 * 86400000).toISOString() },
      ]),
    );
    const { getAgentCostSummary } = await import('./queries');
    const out = await getAgentCostSummary('t-1');
    expect(out.totalCents30d).toBeCloseTo(3.75, 4);
  });
});
