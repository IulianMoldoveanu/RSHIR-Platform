// Unit tests for approveRecommendation + dismissRecommendation.
//
// Same module-boundary mock pattern as ./actions.test.ts: the action under
// test runs real code; only the Supabase + tenant collaborators are stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT_ID = 'tenant-aaa';
const OTHER_TENANT_ID = 'tenant-bbb';
const USER_ID = 'user-1';
const REC_ID = '22222222-2222-2222-2222-222222222222';

// ----- mocks (declared before the SUT import) -----

const getUserMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

const growthSelectMock = vi.fn();
const growthUpdateMock = vi.fn();
const auditInsertMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      // read path: select(...).eq(...).eq(...).maybeSingle()
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(growthSelectMock(table)),
          }),
        }),
      }),
      // write path: update(patch).eq(col1, val1).eq(col2, val2)
      update: (patch: unknown) => ({
        eq: (col1: string, val1: unknown) => ({
          eq: (col2: string, val2: unknown) =>
            Promise.resolve(growthUpdateMock(table, patch, { col1, val1, col2, val2 })),
        }),
      }),
      // audit_log insert path
      insert: (row: unknown) => {
        auditInsertMock(table, row);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

const getActiveTenantMock = vi.fn();
const assertTenantMemberMock = vi.fn();
const getTenantRoleMock = vi.fn();
vi.mock('@/lib/tenant', () => ({
  getActiveTenant: () => getActiveTenantMock(),
  assertTenantMember: (uid: string, tid: string) => assertTenantMemberMock(uid, tid),
  getTenantRole: (uid: string, tid: string) => getTenantRoleMock(uid, tid),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { approveRecommendation, dismissRecommendation } from './growth-actions';

// ----- helpers -----

function authedAs(role: 'OWNER' | 'STAFF' | null) {
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } });
  getActiveTenantMock.mockResolvedValue({
    user: { id: USER_ID },
    tenant: { id: TENANT_ID },
  });
  assertTenantMemberMock.mockResolvedValue(undefined);
  getTenantRoleMock.mockResolvedValue(role);
}

describe('approveRecommendation (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    growthSelectMock.mockReturnValue({
      data: { id: REC_ID, status: 'pending' },
      error: null,
    });
    growthUpdateMock.mockReturnValue({ error: null });
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('rejects when expectedTenantId is empty', async () => {
    const r = await approveRecommendation(REC_ID, '');
    expect(r).toEqual({ ok: false, error: 'missing_tenant_id' });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const r = await approveRecommendation(REC_ID, TENANT_ID);
    expect(r).toEqual({ ok: false, error: 'unauthenticated' });
    expect(growthUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant attempts', async () => {
    authedAs('OWNER');
    const r = await approveRecommendation(REC_ID, OTHER_TENANT_ID);
    expect(r).toEqual({ ok: false, error: 'tenant_mismatch' });
    expect(growthUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects STAFF (only OWNER can approve)', async () => {
    authedAs('STAFF');
    const r = await approveRecommendation(REC_ID, TENANT_ID);
    expect(r).toEqual({ ok: false, error: 'forbidden' });
    expect(growthUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects invalid id (not a UUID)', async () => {
    authedAs('OWNER');
    const r = await approveRecommendation('not-a-uuid', TENANT_ID);
    expect(r).toEqual({ ok: false, error: 'invalid_input' });
    expect(growthSelectMock).not.toHaveBeenCalled();
  });

  it('returns not_found when row does not exist for tenant', async () => {
    authedAs('OWNER');
    growthSelectMock.mockReturnValue({ data: null, error: null });
    const r = await approveRecommendation(REC_ID, TENANT_ID);
    expect(r).toEqual({ ok: false, error: 'not_found' });
    expect(growthUpdateMock).not.toHaveBeenCalled();
  });

  it('returns already_decided when status is not pending (idempotent)', async () => {
    authedAs('OWNER');
    growthSelectMock.mockReturnValue({
      data: { id: REC_ID, status: 'approved' },
      error: null,
    });
    const r = await approveRecommendation(REC_ID, TENANT_ID);
    expect(r).toEqual({ ok: false, error: 'already_decided' });
    expect(growthUpdateMock).not.toHaveBeenCalled();
  });

  it('happy path: flips status to approved, scopes by id+tenant_id, audits', async () => {
    authedAs('OWNER');
    const r = await approveRecommendation(REC_ID, TENANT_ID);
    expect(r).toEqual({ ok: true });

    expect(growthUpdateMock).toHaveBeenCalledTimes(1);
    const [table, patch, scope] = growthUpdateMock.mock.calls[0];
    expect(table).toBe('growth_recommendations');
    expect((patch as { status: string }).status).toBe('approved');
    expect((patch as { decided_by: string }).decided_by).toBe(USER_ID);
    expect((patch as { decided_at: string }).decided_at).toBeTruthy();
    expect(scope).toEqual({
      col1: 'id',
      val1: REC_ID,
      col2: 'tenant_id',
      val2: TENANT_ID,
    });

    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const [auditTable, auditRow] = auditInsertMock.mock.calls[0];
    expect(auditTable).toBe('audit_log');
    expect(auditRow).toMatchObject({
      tenant_id: TENANT_ID,
      actor_user_id: USER_ID,
      action: 'ai_ceo.recommendation_approved',
      entity_type: 'growth_recommendation',
      entity_id: REC_ID,
    });
  });

  it('returns friendlyDbError-sanitized message on DB read error (not raw .message)', async () => {
    authedAs('OWNER');
    growthSelectMock.mockReturnValue({
      data: null,
      // RLS violation — raw message would leak policy name; friendlyDbError
      // must replace it with the generic permission copy.
      error: { code: '42501', message: 'permission denied for table growth_recommendations' },
    });
    const r = await approveRecommendation(REC_ID, TENANT_ID);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('Nu aveți permisiunea pentru această operațiune.');
    expect(r.error).not.toContain('growth_recommendations');
    expect(growthUpdateMock).not.toHaveBeenCalled();
  });

  it('returns friendlyDbError-sanitized message on DB write error', async () => {
    authedAs('OWNER');
    growthUpdateMock.mockReturnValue({
      error: { code: '23514', message: 'new row violates check constraint "growth_recommendations_status_check"' },
    });
    const r = await approveRecommendation(REC_ID, TENANT_ID);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('Datele introduse nu trec validarea.');
    expect(r.error).not.toContain('growth_recommendations_status_check');
  });
});

describe('dismissRecommendation (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    growthSelectMock.mockReturnValue({
      data: { id: REC_ID, status: 'pending' },
      error: null,
    });
    growthUpdateMock.mockReturnValue({ error: null });
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('rejects STAFF', async () => {
    authedAs('STAFF');
    const r = await dismissRecommendation(REC_ID, TENANT_ID);
    expect(r).toEqual({ ok: false, error: 'forbidden' });
    expect(growthUpdateMock).not.toHaveBeenCalled();
  });

  it('returns already_decided when row already dismissed (idempotent)', async () => {
    authedAs('OWNER');
    growthSelectMock.mockReturnValue({
      data: { id: REC_ID, status: 'dismissed' },
      error: null,
    });
    const r = await dismissRecommendation(REC_ID, TENANT_ID);
    expect(r).toEqual({ ok: false, error: 'already_decided' });
    expect(growthUpdateMock).not.toHaveBeenCalled();
  });

  it('happy path: flips status to dismissed, audits with the dismissed action name', async () => {
    authedAs('OWNER');
    const r = await dismissRecommendation(REC_ID, TENANT_ID);
    expect(r).toEqual({ ok: true });

    const [, patch, scope] = growthUpdateMock.mock.calls[0];
    expect((patch as { status: string }).status).toBe('dismissed');
    expect((patch as { decided_by: string }).decided_by).toBe(USER_ID);
    expect(scope.val2).toBe(TENANT_ID);

    const [, auditRow] = auditInsertMock.mock.calls[0];
    expect(auditRow).toMatchObject({
      action: 'ai_ceo.recommendation_dismissed',
      entity_type: 'growth_recommendation',
      entity_id: REC_ID,
    });
  });
});
