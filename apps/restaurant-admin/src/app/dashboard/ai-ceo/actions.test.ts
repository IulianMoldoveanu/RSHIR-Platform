// E2E-flavoured unit test for updateBriefSchedule. Covers the full guard
// chain (auth → tenant match → tenant member → OWNER role → zod) plus the
// happy path that writes the upsert + audit log.
//
// We mock at the module boundary so the action under test is the *real*
// implementation — only the I/O collaborators are stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT_ID = 'tenant-aaa';
const OTHER_TENANT_ID = 'tenant-bbb';
const USER_ID = 'user-1';

// ----- mocks (declared before the SUT import) -----

const getUserMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

const upsertMock = vi.fn();
const auditInsertMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: (row: unknown, opts: unknown) => {
        upsertMock(table, row, opts);
        return Promise.resolve({ error: null });
      },
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

import { updateBriefSchedule } from './actions';

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

describe('updateBriefSchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('rejects when expectedTenantId is empty', async () => {
    const r = await updateBriefSchedule('', { enabled: true, delivery_hour_local: 9 });
    expect(r).toEqual({ ok: false, error: 'missing_tenant_id' });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const r = await updateBriefSchedule(TENANT_ID, { enabled: true, delivery_hour_local: 9 });
    expect(r).toEqual({ ok: false, error: 'unauthenticated' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects when expected tenant differs from active tenant (cross-tenant attempt)', async () => {
    authedAs('OWNER');
    const r = await updateBriefSchedule(OTHER_TENANT_ID, {
      enabled: true,
      delivery_hour_local: 9,
    });
    expect(r).toEqual({ ok: false, error: 'tenant_mismatch' });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it('rejects STAFF (only OWNER can edit)', async () => {
    authedAs('STAFF');
    const r = await updateBriefSchedule(TENANT_ID, {
      enabled: false,
      delivery_hour_local: 9,
    });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects when role is null (not a member)', async () => {
    authedAs(null);
    const r = await updateBriefSchedule(TENANT_ID, {
      enabled: true,
      delivery_hour_local: 9,
    });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects invalid hour (>23)', async () => {
    authedAs('OWNER');
    const r = await updateBriefSchedule(TENANT_ID, {
      enabled: true,
      delivery_hour_local: 25,
    });
    expect(r).toEqual({ ok: false, error: 'invalid_input' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects non-integer hour', async () => {
    authedAs('OWNER');
    const r = await updateBriefSchedule(TENANT_ID, {
      enabled: true,
      delivery_hour_local: 9.5,
    });
    expect(r).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('rejects negative hour', async () => {
    authedAs('OWNER');
    const r = await updateBriefSchedule(TENANT_ID, {
      enabled: true,
      delivery_hour_local: -1,
    });
    expect(r).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('writes upsert + audit on the happy path', async () => {
    authedAs('OWNER');
    const r = await updateBriefSchedule(TENANT_ID, {
      enabled: true,
      delivery_hour_local: 9,
    });
    expect(r).toEqual({ ok: true });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [table, row, opts] = upsertMock.mock.calls[0];
    expect(table).toBe('copilot_brief_schedules');
    expect(row).toMatchObject({
      tenant_id: TENANT_ID,
      enabled: true,
      delivery_hour_local: 9,
      consecutive_skips: 0,
    });
    expect(opts).toEqual({ onConflict: 'tenant_id' });

    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const [auditTable, auditRow] = auditInsertMock.mock.calls[0];
    expect(auditTable).toBe('audit_log');
    expect(auditRow).toMatchObject({
      tenant_id: TENANT_ID,
      actor_user_id: USER_ID,
      action: 'ai_ceo.brief_schedule_updated',
      metadata: { enabled: true, delivery_hour_local: 9 },
    });
  });

  it('uses server-controlled tenant_id (never trusts a tenant_id smuggled in raw body)', async () => {
    authedAs('OWNER');
    // Even if a malicious payload slipped a `tenant_id` field through (it
    // can't via the typed signature, but we simulate it), the action's
    // upsert must always use expectedTenantId.
    const r = await updateBriefSchedule(TENANT_ID, {
      enabled: true,
      delivery_hour_local: 9,
      // @ts-expect-error — intentionally extra field
      tenant_id: 'attacker-tenant',
    });
    expect(r).toEqual({ ok: true });
    const [, row] = upsertMock.mock.calls[0];
    expect((row as { tenant_id: string }).tenant_id).toBe(TENANT_ID);
  });

  it('resets consecutive_skips on save (re-arm after auto-pause)', async () => {
    authedAs('OWNER');
    await updateBriefSchedule(TENANT_ID, { enabled: true, delivery_hour_local: 7 });
    const [, row] = upsertMock.mock.calls[0];
    expect((row as { consecutive_skips: number }).consecutive_skips).toBe(0);
  });

  it('happy path with enabled=false (operator pauses brief manually)', async () => {
    authedAs('OWNER');
    const r = await updateBriefSchedule(TENANT_ID, {
      enabled: false,
      delivery_hour_local: 8,
    });
    expect(r).toEqual({ ok: true });
    const [, row] = upsertMock.mock.calls[0];
    expect((row as { enabled: boolean }).enabled).toBe(false);
  });
});
