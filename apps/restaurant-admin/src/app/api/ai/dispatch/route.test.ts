// Unit tests for POST /api/ai/dispatch.
//
// Covers:
//   - 401: no Supabase session.
//   - 403: STAFF user attempts a finance.* intent (OWNER-only).
//   - 422: unknown intent prefix never reaches the bridge.
//   - happy path: OWNER + valid intent + bridge returns EXECUTED.
//   - role gate per agent (compliance OWNER-only on tenant side, platform
//     admin bypass for compliance only — NOT for finance).
//
// The route's auth boundary is `getActiveTenant` (Supabase cookie) +
// `getTenantRole` + the per-agent gate. We mock those and the bridge so
// the test is hermetic and runs in <100ms.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (declared before SUT import) ─────────────────────────────

const getActiveTenantMock = vi.fn();
const getTenantRoleMock = vi.fn((..._args: unknown[]) => undefined as unknown);
vi.mock('@/lib/tenant', () => ({
  getActiveTenant: () => getActiveTenantMock(),
  getTenantRole: (a: string, b: string) => getTenantRoleMock(a, b),
}));

const isPlatformAdminEmailMock = vi.fn((..._args: unknown[]) => false);
vi.mock('@/lib/auth/platform-admin', () => ({
  isPlatformAdminEmail: (email: string | null | undefined) => isPlatformAdminEmailMock(email),
}));

const dispatchViaEdgeMock = vi.fn();
vi.mock('@/lib/ai/master-orchestrator-edge-bridge', () => ({
  dispatchViaEdge: (input: unknown) => dispatchViaEdgeMock(input),
}));

// Standard-plan Hepi cap — mocked to "always allowed" for legacy tests
// below; the cap-specific assertions live in `usage-caps.test.ts`. A
// dedicated test in this file exercises the 429 over-cap path.
const checkAndIncrementUsageMock = vi.fn();
vi.mock('@/lib/usage-caps', () => ({
  checkAndIncrementUsage: (...args: unknown[]) => checkAndIncrementUsageMock(...args),
}));

// ── Import SUT after mocks ─────────────────────────────────────────

import { POST } from './route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/ai/dispatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getActiveTenantMock.mockReset();
  getTenantRoleMock.mockReset();
  isPlatformAdminEmailMock.mockReset();
  isPlatformAdminEmailMock.mockReturnValue(false);
  dispatchViaEdgeMock.mockReset();
  checkAndIncrementUsageMock.mockReset();
  // Default: cap always allows so legacy assertions on the bridge/handler
  // path are unaffected. Tests that exercise the 429 path override this.
  checkAndIncrementUsageMock.mockResolvedValue({
    allowed: true,
    used: 1,
    cap: 10,
    periodKind: 'daily',
    periodStart: '2026-05-27T00:00:00+00:00',
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/ai/dispatch', () => {
  it('returns 401 when there is no session', async () => {
    getActiveTenantMock.mockRejectedValue(new Error('Unauthenticated.'));
    const res = await POST(makeReq({ intent: 'analytics.summary', payload: {} }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
    // Bridge must not be called without a session.
    expect(dispatchViaEdgeMock).not.toHaveBeenCalled();
  });

  it('returns 400 when intent is missing', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    const res = await POST(makeReq({ payload: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_intent');
  });

  it('returns 422 for unknown agent prefix without hitting the bridge', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    const res = await POST(makeReq({ intent: 'bogus.thing', payload: {} }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('unknown_intent');
    expect(dispatchViaEdgeMock).not.toHaveBeenCalled();
  });

  it('returns 403 when a STAFF user calls finance.*', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'staff@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('STAFF');
    const res = await POST(makeReq({ intent: 'finance.cash_flow_30d', payload: {} }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.agent).toBe('finance');
    expect(dispatchViaEdgeMock).not.toHaveBeenCalled();
  });

  it('returns 403 when a STAFF user calls compliance.* (OWNER-only)', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'staff@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('STAFF');
    const res = await POST(
      makeReq({ intent: 'compliance.gdpr_data_audit', payload: {} }),
    );
    expect(res.status).toBe(403);
    expect(dispatchViaEdgeMock).not.toHaveBeenCalled();
  });

  it('allows STAFF to call menu.* (write but not OWNER-only)', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'staff@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('STAFF');
    dispatchViaEdgeMock.mockResolvedValue({
      ok: true,
      state: 'PROPOSED',
      runId: 'run_42',
      reason: 'trust_level',
      summary: 'Propus.',
    });
    const res = await POST(
      makeReq({ intent: 'menu.description_update', payload: { productId: 'p1', description: 'x' } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      state: 'PROPOSED',
      runId: 'run_42',
      reason: 'trust_level',
      summary: 'Propus.',
    });
    expect(dispatchViaEdgeMock).toHaveBeenCalledOnce();
    expect(dispatchViaEdgeMock).toHaveBeenCalledWith({
      tenantId: 't1',
      intent: 'menu.description_update',
      payload: { productId: 'p1', description: 'x' },
      actorUserId: 'u1',
    });
  });

  it('forwards OWNER call and returns EXECUTED envelope', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    dispatchViaEdgeMock.mockResolvedValue({
      ok: true,
      state: 'EXECUTED',
      runId: 'run_7',
      data: { items: [{ id: 'a' }] },
    });
    const res = await POST(makeReq({ intent: 'analytics.summary', payload: { period: 'today' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      state: 'EXECUTED',
      runId: 'run_7',
      data: { items: [{ id: 'a' }] },
    });
  });

  it('platform-admin email bypasses STAFF gate for compliance but NOT for finance', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'platform@hir.ro' },
      tenant: { id: 't1' },
    });
    isPlatformAdminEmailMock.mockReturnValue(true);
    dispatchViaEdgeMock.mockResolvedValue({
      ok: true,
      state: 'EXECUTED',
      runId: 'run_9',
      data: { ok: true },
    });

    // Compliance — bypass applies.
    const okRes = await POST(
      makeReq({ intent: 'compliance.gdpr_data_audit', payload: {} }),
    );
    expect(okRes.status).toBe(200);
    expect(getTenantRoleMock).not.toHaveBeenCalled();

    // Finance — bypass does NOT apply; must look up the role.
    getTenantRoleMock.mockResolvedValue(null);
    const denyRes = await POST(makeReq({ intent: 'finance.cash_flow_30d', payload: {} }));
    expect(denyRes.status).toBe(403);
    expect(getTenantRoleMock).toHaveBeenCalled();
  });

  it('surfaces bridge unknown_intent as 422', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    dispatchViaEdgeMock.mockResolvedValue({
      ok: false,
      error: 'unknown_intent',
      message: 'Intent "ops.nonexistent" is not registered.',
    });
    const res = await POST(makeReq({ intent: 'ops.nonexistent', payload: {} }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('unknown_intent');
  });

  it('surfaces bridge transport failure as 502', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    dispatchViaEdgeMock.mockResolvedValue({
      ok: false,
      error: 'edge_fn_unreachable',
      message: 'ECONNRESET',
    });
    const res = await POST(makeReq({ intent: 'analytics.summary', payload: {} }));
    expect(res.status).toBe(502);
  });

  it('returns 429 when the Standard-plan Hepi cap is exhausted', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    checkAndIncrementUsageMock.mockResolvedValue({
      allowed: false,
      used: 10,
      cap: 10,
      periodKind: 'daily',
      periodStart: '2026-05-27T00:00:00+00:00',
      message: 'Hai patroane, ai folosit toate cele 10 conversații...',
    });
    const res = await POST(makeReq({ intent: 'analytics.summary', payload: {} }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('cap_exceeded');
    expect(body.resource).toBe('hepi_conversations');
    expect(body.cap).toBe(10);
    expect(body.message).toMatch(/Hai patroane/);
    // Bridge must NOT be called once the cap rejects.
    expect(dispatchViaEdgeMock).not.toHaveBeenCalled();
  });

  it('returns 503 when the cap RPC throws (fail-closed)', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    checkAndIncrementUsageMock.mockRejectedValue(new Error('rpc_offline'));
    const res = await POST(makeReq({ intent: 'analytics.summary', payload: {} }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('cap_check_failed');
    expect(dispatchViaEdgeMock).not.toHaveBeenCalled();
  });

  it('master.* bypasses the Hepi cap so the orchestrator keeps working at-cap', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    dispatchViaEdgeMock.mockResolvedValue({
      ok: true,
      state: 'EXECUTED',
      runId: 'run_master',
      data: {},
    });
    const res = await POST(makeReq({ intent: 'master.summary', payload: {} }));
    expect(res.status).toBe(200);
    // Cap helper must NOT be called for master traffic.
    expect(checkAndIncrementUsageMock).not.toHaveBeenCalled();
    expect(dispatchViaEdgeMock).toHaveBeenCalledOnce();
  });
});
