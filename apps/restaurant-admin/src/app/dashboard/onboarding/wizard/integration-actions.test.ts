import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock heavy dependencies before importing the action ───────────────────────
const tenantMock = vi.hoisted(() => vi.fn());
const tenantRoleMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());
const createSandboxKeyMock = vi.hoisted(() => vi.fn());
const adminBuilder = vi.hoisted(() => ({ factory: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminBuilder.factory(),
}));
vi.mock('@/lib/tenant', () => ({
  getActiveTenant: () =>
    Promise.resolve({ user: { id: 'uid-1' }, tenant: tenantMock() }),
  getTenantRole: () => Promise.resolve(tenantRoleMock()),
}));
vi.mock('@/lib/audit', () => ({ logAudit: auditMock }));
vi.mock('../../settings/integrations/api/actions', () => ({
  createSandboxKey: createSandboxKeyMock,
}));

const TENANT_ID = '00000000-0000-0000-0000-bbbbbbbbbbbb';

// Builds a minimal Supabase-shaped admin client mock: select → eq → single returns
// the given data, update → eq returns the given write error.
function makeAdminMock(opts: {
  settings?: Record<string, unknown>;
  readError?: { message: string } | null;
  writeError?: { message: string } | null;
}) {
  const single = vi.fn(() =>
    Promise.resolve({
      data: opts.readError ? null : { settings: opts.settings ?? {} },
      error: opts.readError ?? null,
    }),
  );
  const selectEq = vi.fn(() => ({ single }));
  const selectFn = vi.fn(() => ({ eq: selectEq }));

  const updateEq = vi.fn(() =>
    Promise.resolve({ error: opts.writeError ?? null }),
  );
  const updateFn = vi.fn(() => ({ eq: updateEq }));

  const from = vi.fn((table: string) => {
    if (table === 'tenants') return { select: selectFn, update: updateFn };
    return {};
  });

  return { from };
}

function setupHappy(role = 'OWNER') {
  tenantMock.mockReturnValue({ id: TENANT_ID });
  tenantRoleMock.mockReturnValue(role);
  auditMock.mockResolvedValue(undefined);
  createSandboxKeyMock.mockResolvedValue({ ok: true, rawKey: 'hir_testkey', keyPrefix: 'hir_test' });
}

describe('setIntegrationMode — input validation', () => {
  it('rejects missing tenantId', async () => {
    const { setIntegrationMode } = await import('./integration-actions');
    const r = await setIntegrationMode('', 'storefront_only');
    expect(r).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects unknown mode', async () => {
    setupHappy();
    const { setIntegrationMode } = await import('./integration-actions');
    // @ts-expect-error intentionally bad value
    const r = await setIntegrationMode(TENANT_ID, 'bad_mode');
    expect(r).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});

describe('setIntegrationMode — auth guards', () => {
  beforeEach(() => {
    tenantMock.mockReset();
    tenantRoleMock.mockReset();
    auditMock.mockReset();
    createSandboxKeyMock.mockReset();
    adminBuilder.factory.mockReset();
  });

  it('returns tenant_mismatch when tenant id differs', async () => {
    tenantMock.mockReturnValue({ id: 'other-tenant' });
    tenantRoleMock.mockReturnValue('OWNER');
    const { setIntegrationMode } = await import('./integration-actions');
    const r = await setIntegrationMode(TENANT_ID, 'embed_widget');
    expect(r).toMatchObject({ ok: false, error: 'tenant_mismatch' });
  });

  it('returns forbidden_owner_only for non-OWNER', async () => {
    setupHappy('STAFF');
    adminBuilder.factory.mockReturnValue(makeAdminMock({}));
    const { setIntegrationMode } = await import('./integration-actions');
    const r = await setIntegrationMode(TENANT_ID, 'api_only');
    expect(r).toMatchObject({ ok: false, error: 'forbidden_owner_only' });
  });
});

describe('setIntegrationMode — happy paths', () => {
  beforeEach(() => {
    tenantMock.mockReset();
    tenantRoleMock.mockReset();
    auditMock.mockReset();
    createSandboxKeyMock.mockReset();
    adminBuilder.factory.mockReset();
  });

  it('storefront_only: saves mode and returns rawKey=null (no API key created)', async () => {
    setupHappy();
    adminBuilder.factory.mockReturnValue(makeAdminMock({}));
    const { setIntegrationMode } = await import('./integration-actions');
    const r = await setIntegrationMode(TENANT_ID, 'storefront_only');
    expect(r).toMatchObject({ ok: true, rawKey: null });
    expect(createSandboxKeyMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.integration_mode_set', metadata: { mode: 'storefront_only' } }),
    );
  });

  it('embed_widget: saves mode and returns rawKey from createSandboxKey', async () => {
    setupHappy();
    adminBuilder.factory.mockReturnValue(makeAdminMock({}));
    const { setIntegrationMode } = await import('./integration-actions');
    const r = await setIntegrationMode(TENANT_ID, 'embed_widget');
    expect(r).toMatchObject({ ok: true, rawKey: 'hir_testkey' });
    expect(createSandboxKeyMock).toHaveBeenCalledWith(TENANT_ID);
  });

  it('api_only: returns rawKey', async () => {
    setupHappy();
    adminBuilder.factory.mockReturnValue(makeAdminMock({}));
    const { setIntegrationMode } = await import('./integration-actions');
    const r = await setIntegrationMode(TENANT_ID, 'api_only');
    expect(r).toMatchObject({ ok: true, rawKey: 'hir_testkey' });
  });

  it('embed_or_api: returns rawKey', async () => {
    setupHappy();
    adminBuilder.factory.mockReturnValue(makeAdminMock({}));
    const { setIntegrationMode } = await import('./integration-actions');
    const r = await setIntegrationMode(TENANT_ID, 'embed_or_api');
    expect(r).toMatchObject({ ok: true, rawKey: 'hir_testkey' });
  });

  it('key creation failure is non-fatal: returns ok=true rawKey=null', async () => {
    setupHappy();
    createSandboxKeyMock.mockResolvedValue({ ok: false, error: 'db_error' });
    adminBuilder.factory.mockReturnValue(makeAdminMock({}));
    const { setIntegrationMode } = await import('./integration-actions');
    const r = await setIntegrationMode(TENANT_ID, 'api_only');
    expect(r).toMatchObject({ ok: true, rawKey: null });
  });

  it('db write failure returns db_error', async () => {
    setupHappy();
    adminBuilder.factory.mockReturnValue(
      makeAdminMock({ writeError: { message: 'constraint violation' } }),
    );
    const { setIntegrationMode } = await import('./integration-actions');
    const r = await setIntegrationMode(TENANT_ID, 'embed_widget');
    expect(r).toMatchObject({ ok: false, error: 'db_error', detail: 'constraint violation' });
  });
});
