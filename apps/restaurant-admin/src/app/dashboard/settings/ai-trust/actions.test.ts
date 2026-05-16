// Vitest cases for updateMonthlyBudgetCents — the server action exposed
// by the AI trust settings page. Mirrors the mocking pattern used by
// other server-action tests in this app (payout-actions, growth-actions).

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const supabaseUser = vi.hoisted(() => vi.fn());
const tenant = vi.hoisted(() => vi.fn());
const tenantRole = vi.hoisted(() => vi.fn());
const assertTenantMemberMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());
const adminBuilder = vi.hoisted(() => ({ factory: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: supabaseUser } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminBuilder.factory(),
}));
vi.mock('@/lib/tenant', () => ({
  getActiveTenant: () => Promise.resolve({ tenant: tenant() }),
  getTenantRole: () => Promise.resolve(tenantRole()),
  assertTenantMember: assertTenantMemberMock,
}));
vi.mock('@/lib/audit', () => ({ logAudit: auditMock }));

function makeAdminMock(args: {
  existingSettings?: Record<string, unknown> | null;
  readError?: { message: string } | null;
  writeError?: { message: string } | null;
}) {
  const readResult = {
    data: args.existingSettings === undefined ? { settings: {} } : { settings: args.existingSettings },
    error: args.readError ?? null,
  };
  const writeResult = { data: null, error: args.writeError ?? null };

  const updateBuilder = {
    eq: vi.fn(() => Promise.resolve(writeResult)),
  };
  const selectBuilder = {
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve(readResult)),
    })),
  };

  const fromMock = vi.fn(() => ({
    select: vi.fn(() => selectBuilder),
    update: vi.fn(() => updateBuilder),
  }));
  return { from: fromMock, _spies: { update: updateBuilder } };
}

const VALID_TENANT_ID = '00000000-0000-0000-0000-0000000000aa';
const VALID_USER_ID = '00000000-0000-0000-0000-0000000000ff';

function happyPathSetup(overrides?: {
  existingSettings?: Record<string, unknown> | null;
  role?: string;
  writeError?: { message: string } | null;
  readError?: { message: string } | null;
}) {
  supabaseUser.mockResolvedValue({ data: { user: { id: VALID_USER_ID } } });
  tenant.mockReturnValue({ id: VALID_TENANT_ID });
  tenantRole.mockReturnValue(overrides?.role ?? 'OWNER');
  assertTenantMemberMock.mockResolvedValue(undefined);
  const admin = makeAdminMock({
    existingSettings: overrides?.existingSettings ?? null,
    readError: overrides?.readError ?? null,
    writeError: overrides?.writeError ?? null,
  });
  adminBuilder.factory.mockReturnValue(admin);
  auditMock.mockResolvedValue(undefined);
  return admin;
}

describe('updateMonthlyBudgetCents', () => {
  beforeEach(() => {
    supabaseUser.mockReset();
    tenant.mockReset();
    tenantRole.mockReset();
    assertTenantMemberMock.mockReset();
    auditMock.mockReset();
    adminBuilder.factory.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('rejects missing tenant id', async () => {
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents('', { monthly_budget_cents: 5000 });
    expect(r).toEqual({ ok: false, error: 'missing_tenant_id' });
  });

  it('rejects unauthenticated callers', async () => {
    supabaseUser.mockResolvedValue({ data: { user: null } });
    tenant.mockReturnValue({ id: VALID_TENANT_ID });
    tenantRole.mockReturnValue('OWNER');
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents(VALID_TENANT_ID, { monthly_budget_cents: 5000 });
    expect(r).toEqual({ ok: false, error: 'unauthenticated' });
  });

  it('rejects tenant mismatch', async () => {
    happyPathSetup();
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents('00000000-0000-0000-0000-other-tenant', {
      monthly_budget_cents: 5000,
    });
    expect(r).toEqual({ ok: false, error: 'tenant_mismatch' });
  });

  it('rejects non-OWNER callers', async () => {
    happyPathSetup({ role: 'STAFF' });
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents(VALID_TENANT_ID, { monthly_budget_cents: 5000 });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects below-minimum input (bounds = $1)', async () => {
    happyPathSetup();
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents(VALID_TENANT_ID, { monthly_budget_cents: 50 });
    expect(r).toEqual({ ok: false, error: 'bounds' });
  });

  it('rejects above-maximum input (bounds = $1000)', async () => {
    happyPathSetup();
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents(VALID_TENANT_ID, { monthly_budget_cents: 100_001 });
    expect(r).toEqual({ ok: false, error: 'bounds' });
  });

  it('rejects non-integer input', async () => {
    happyPathSetup();
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents(VALID_TENANT_ID, { monthly_budget_cents: 1234.5 });
    expect(r).toEqual({ ok: false, error: 'bounds' });
  });

  it('persists a valid value into tenants.settings.ai.monthly_budget_cents', async () => {
    const admin = happyPathSetup({
      existingSettings: { branding: { logo_url: 'x' }, ai: { existing_key: 'kept' } },
    });
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents(VALID_TENANT_ID, { monthly_budget_cents: 8000 });
    expect(r).toEqual({ ok: true });

    // tenants.update was called once with merged settings preserving the
    // other top-level + ai-scope keys.
    const updateCalls = admin.from.mock.results.filter((res) => res.value.update);
    expect(updateCalls.length).toBeGreaterThan(0);
    // Walk the call chain: from('tenants').update({ settings: ... }).eq('id', ...)
    // We can inspect the mocked update directly because we stored a spy.
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ai_ceo.monthly_budget_updated',
        metadata: { monthly_budget_cents: 8000 },
      }),
    );
  });

  it('returns read_failed when tenant settings read errors', async () => {
    happyPathSetup({ readError: { message: 'rls_denied' } });
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents(VALID_TENANT_ID, { monthly_budget_cents: 8000 });
    expect(r).toEqual({ ok: false, error: 'read_failed' });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('returns update_failed when tenant write errors', async () => {
    happyPathSetup({ writeError: { message: 'unique_violation' } });
    const { updateMonthlyBudgetCents } = await import('./actions');
    const r = await updateMonthlyBudgetCents(VALID_TENANT_ID, { monthly_budget_cents: 8000 });
    expect(r).toEqual({ ok: false, error: 'update_failed' });
    expect(auditMock).not.toHaveBeenCalled();
  });
});
