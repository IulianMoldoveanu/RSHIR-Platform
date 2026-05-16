// Unit tests for setPaymentMode (OWNER + platform-admin gated server action).
// Verifies:
//   * invalid mode → invalid_input(mode)
//   * card_* without provider → invalid_input(provider)
//   * mismatched tenant cookie → tenant_mismatch
//   * STAFF role + not platform admin → forbidden_owner_only
//   * OWNER → write merges into settings.payments.{mode,provider}
//   * cod_only keeps a previously-saved provider untouched

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (declared before the SUT import) ─────────────────────────

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

// Track tenants.update payload for assertions. selectMock is reassignable so
// individual tests can vary the existing-payments row.
const updateMock = vi.fn();
let selectResult: { data: { settings: Record<string, unknown> } | null; error: null } = {
  data: { settings: { foo: 'bar', payments: { provider: 'netopia' } } },
  error: null,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(selectResult),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          updateMock(patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ── Import SUT after mocks ──────────────────────────────────────────

import { setPaymentMode } from './actions';

beforeEach(() => {
  getActiveTenantMock.mockReset();
  getTenantRoleMock.mockReset();
  isPlatformAdminEmailMock.mockReset();
  isPlatformAdminEmailMock.mockReturnValue(false);
  updateMock.mockReset();
  selectResult = {
    data: { settings: { foo: 'bar', payments: { provider: 'netopia' } } },
    error: null,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('setPaymentMode', () => {
  it('rejects an invalid mode string', async () => {
    const res = await setPaymentMode(fd({ mode: 'bogus', tenantId: 't1' }));
    expect(res).toEqual({ ok: false, error: 'invalid_input', detail: 'mode' });
  });

  it('rejects card_sandbox without a provider', async () => {
    const res = await setPaymentMode(
      fd({ mode: 'card_sandbox', tenantId: 't1' }),
    );
    expect(res).toEqual({ ok: false, error: 'invalid_input', detail: 'provider' });
  });

  it('rejects card_* with an unknown provider (e.g. legacy "stripe")', async () => {
    const res = await setPaymentMode(
      fd({ mode: 'card_live', provider: 'stripe', tenantId: 't1' }),
    );
    expect(res).toEqual({ ok: false, error: 'invalid_input', detail: 'provider' });
  });

  it('rejects when tenant cookie drifted from expectedTenantId', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't2' },
    });
    const res = await setPaymentMode(fd({ mode: 'cod_only', tenantId: 't1' }));
    expect(res).toEqual({ ok: false, error: 'tenant_mismatch' });
  });

  it('rejects STAFF callers who are not platform admins', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'staff@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('STAFF');
    const res = await setPaymentMode(
      fd({ mode: 'card_sandbox', provider: 'netopia', tenantId: 't1' }),
    );
    expect(res).toEqual({ ok: false, error: 'forbidden_owner_only' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('persists settings.payments.{mode,provider} for OWNER (card_sandbox + netopia)', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    const res = await setPaymentMode(
      fd({ mode: 'card_sandbox', provider: 'netopia', tenantId: 't1' }),
    );
    expect(res).toEqual({ ok: true, mode: 'card_sandbox', provider: 'netopia' });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [patch] = updateMock.mock.calls[0];
    const settings = patch.settings as Record<string, unknown>;
    const payments = settings.payments as Record<string, unknown>;
    expect(settings.foo).toBe('bar');
    expect(payments.mode).toBe('card_sandbox');
    expect(payments.provider).toBe('netopia');
  });

  it('persists viva when OWNER picks card_live + viva', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    const res = await setPaymentMode(
      fd({ mode: 'card_live', provider: 'viva', tenantId: 't1' }),
    );
    expect(res).toEqual({ ok: true, mode: 'card_live', provider: 'viva' });
    const [patch] = updateMock.mock.calls[0];
    const payments = (patch.settings as Record<string, unknown>).payments as Record<string, unknown>;
    expect(payments.provider).toBe('viva');
  });

  it('cod_only preserves an existing provider value', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    selectResult = {
      data: { settings: { payments: { provider: 'viva', mode: 'card_live' } } },
      error: null,
    };
    const res = await setPaymentMode(fd({ mode: 'cod_only', tenantId: 't1' }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.mode).toBe('cod_only');
      expect(res.provider).toBe('viva');
    }
    const [patch] = updateMock.mock.calls[0];
    const payments = (patch.settings as Record<string, unknown>).payments as Record<string, unknown>;
    expect(payments.mode).toBe('cod_only');
    expect(payments.provider).toBe('viva');
  });

  it('allows platform-admin callers who are not tenant members', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'platform@hir.ro' },
      tenant: { id: 't1' },
    });
    isPlatformAdminEmailMock.mockReturnValue(true);
    const res = await setPaymentMode(
      fd({ mode: 'card_live', provider: 'netopia', tenantId: 't1' }),
    );
    expect(res).toEqual({ ok: true, mode: 'card_live', provider: 'netopia' });
    expect(getTenantRoleMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
