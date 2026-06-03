// E2E: the Hepi orchestrator lifecycle across BOTH route handlers.
//
// Exercises the real wiring the unit tests don't cover:
//   confirm mode: POST /api/admin/hepi  (Anthropic proposes a write tool)
//     -> server returns a REAL HMAC-signed proposal, executes NOTHING
//     -> POST /api/admin/hepi/execute (the token) -> action runs
//   direct mode: POST /api/admin/hepi -> action runs inline, no proposal
//   security: tampered token -> 400; non-admin -> 403
//
// Anthropic is mocked via global.fetch; the wrapped server actions + supabase
// are mocked; but proposals (sign/verify) + the registry + the route loop are
// REAL — that's the point.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  mode: 'confirm' as 'confirm' | 'direct',
  adminUser: { id: 'admin-1', email: 'admin@hir.ro' } as { id: string; email: string } | null,
  requireAdmin: { ok: true, userId: 'admin-1', email: 'admin@hir.ro' } as
    | { ok: true; userId: string; email: string }
    | { ok: false; status: 401 | 403; error: string },
  cityRow: { id: 'city-cluj', name: 'Cluj-Napoca', slug: 'cluj-napoca' } as null | { id: string; name: string; slug: string },
  setCityActive: vi.fn(async () => ({ ok: true })),
  anthropicQueue: [] as unknown[],
}));

beforeAll(() => {
  process.env.HEPI_ACTION_SECRET = 'e2e-hmac-secret';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.HIR_PLATFORM_ADMIN_EMAILS = 'admin@hir.ro';
});

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.adminUser } }) } }),
}));
vi.mock('@/lib/auth/platform-admin', () => ({
  isPlatformAdminEmail: (e: string | null | undefined) => !!e && e === (h.adminUser ? h.adminUser.email : null),
  requirePlatformAdmin: async () => h.requireAdmin,
}));
vi.mock('@/lib/hepi/autonomy', () => ({ getHepiMode: async () => h.mode }));
vi.mock('@/lib/audit', () => ({ logAudit: async () => undefined }));

// Chainable supabase stub: resolveCity reads cities; everything else harmless.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const row = table === 'cities' ? h.cityRow : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.ilike = () => b;
      b.maybeSingle = () => Promise.resolve({ data: row, error: null });
      b.limit = () => Promise.resolve({ data: row ? [row] : [], error: null });
      return b;
    },
  }),
}));

// Wrapped server actions — mock the whole set so importing the registry never
// pulls real 'use server' / Next runtime. Only setCityActive is asserted.
vi.mock('@/app/dashboard/admin/cities/actions', () => ({
  setCityActive: (a: unknown) => h.setCityActive(a),
  activateCountyCapitals: (async () => ({ ok: true })),
}));
vi.mock('@/app/dashboard/admin/tenants/actions', () => ({ setTenantStatus: (async () => ({ ok: true })), setTenantCity: (async () => ({ ok: true })) }));
vi.mock('@/app/dashboard/admin/verifications/actions', () => ({ verifyFleetKyf: (async () => ({ ok: true })), verifyCourierKyc: (async () => ({ ok: true })) }));
vi.mock('@/app/dashboard/admin/fleet-allocation/actions', () => ({
  assignFleet: (async () => ({ ok: true })), markStrike: (async () => ({ ok: true })), promoteToPrimary: (async () => ({ ok: true })), terminateAssignment: (async () => ({ ok: true })),
}));
vi.mock('@/app/dashboard/admin/partners/actions', () => ({ createPartner: (async () => ({ ok: true })) }));
vi.mock('@/app/dashboard/admin/connect-billing/actions', () => ({ generatePreviousWeek: (async () => ({ ok: true })) }));
vi.mock('@/app/dashboard/admin/incidents/actions', () => ({ createIncident: (async () => ({ ok: true })), updateIncidentStatus: (async () => ({ ok: true })) }));
vi.mock('@/app/dashboard/admin/fleet-managers/actions', () => ({ addFleetManagerMembership: (async () => ({ ok: true })) }));
vi.mock('@/app/dashboard/admin/onboard/actions', () => ({ createTenantWithOwner: (async () => ({ ok: true })) }));
vi.mock('@/app/dashboard/admin/onboard/sibling/actions', () => ({ createSiblingLocationAction: (async () => ({ ok: true })) }));

import { POST as hepiPOST } from './route';
import { POST as execPOST } from './execute/route';
import { verifyProposal } from '@/lib/hepi/proposals';

function fetchRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}
const toolUse = (name: string, input: unknown) => ({ content: [{ type: 'tool_use', id: 'tu1', name, input }], stop_reason: 'tool_use' });
const textMsg = (text: string) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

function hepiReq(prompt: string) {
  return new Request('http://localhost/api/admin/hepi', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }),
  });
}
function execReq(token: string) {
  return new Request('http://localhost/api/admin/hepi/execute', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  });
}

beforeEach(() => {
  h.mode = 'confirm';
  h.adminUser = { id: 'admin-1', email: 'admin@hir.ro' };
  h.requireAdmin = { ok: true, userId: 'admin-1', email: 'admin@hir.ro' };
  h.cityRow = { id: 'city-cluj', name: 'Cluj-Napoca', slug: 'cluj-napoca' };
  h.setCityActive.mockClear();
  h.anthropicQueue = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = vi.fn(async () => fetchRes(h.anthropicQueue.shift())) as any;
});

afterEach(() => vi.clearAllMocks());

describe('Hepi orchestrator lifecycle (e2e)', () => {
  it('confirm mode: proposes a signed action, executes NOTHING until /execute is called', async () => {
    h.anthropicQueue = [toolUse('activate_city', { city: 'cluj-napoca' }), textMsg('Am pregătit activarea.')];

    const res = await hepiPOST(hepiReq('activează orașul Cluj-Napoca') as never);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.mode).toBe('confirm');
    expect(data.pending_actions).toHaveLength(1);
    // Nothing executed yet.
    expect(h.setCityActive).not.toHaveBeenCalled();

    // The proposal token is a genuine HMAC-signed payload for exactly this action.
    const token = data.pending_actions[0].token as string;
    const payload = verifyProposal(token);
    expect(payload?.actionId).toBe('activate_city');
    expect(payload?.params).toEqual({ city: 'cluj-napoca' });

    // Approve -> /execute runs the wrapped, audited action.
    const exec = await execPOST(execReq(token) as never);
    const execData = await exec.json();
    expect(exec.status).toBe(200);
    expect(execData.ok).toBe(true);
    expect(h.setCityActive).toHaveBeenCalledWith({ cityId: 'city-cluj', active: true });
    expect(execData.message).toContain('Cluj-Napoca');
  });

  it('direct mode: executes inline with no pending proposal', async () => {
    h.mode = 'direct';
    h.anthropicQueue = [toolUse('activate_city', { city: 'cluj-napoca' }), textMsg('Am activat.')];

    const res = await hepiPOST(hepiReq('activează Cluj') as never);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.mode).toBe('direct');
    expect(data.pending_actions).toHaveLength(0);
    expect(h.setCityActive).toHaveBeenCalledWith({ cityId: 'city-cluj', active: true });
  });

  it('security: a tampered proposal token is rejected by /execute', async () => {
    h.anthropicQueue = [toolUse('activate_city', { city: 'cluj-napoca' }), textMsg('ok')];
    const res = await hepiPOST(hepiReq('activează Cluj') as never);
    const data = await res.json();
    const token = data.pending_actions[0].token as string;

    // Flip the last char of the signature.
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    const exec = await execPOST(execReq(tampered) as never);
    expect(exec.status).toBe(400);
    expect(h.setCityActive).not.toHaveBeenCalled();
  });

  it('security: a non-platform-admin cannot execute', async () => {
    h.requireAdmin = { ok: false, status: 403, error: 'forbidden' };
    // Any syntactically-valid-looking token; auth fails before verification.
    const exec = await execPOST(execReq('whatever.sig') as never);
    expect(exec.status).toBe(403);
    expect(h.setCityActive).not.toHaveBeenCalled();
  });

  it('non-admin cannot even reach the orchestrator', async () => {
    h.adminUser = null;
    const res = await hepiPOST(hepiReq('activează Cluj') as never);
    expect(res.status).toBe(401);
  });
});
