// Unit tests for setPaymentMode (OWNER + platform-admin gated server action).
// Verifies:
//   * invalid mode → invalid_input
//   * mismatched tenant cookie → tenant_mismatch
//   * STAFF role + not platform admin → forbidden_owner_only
//   * OWNER → write merges into settings.payments.mode

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

// Track tenants.update payload for assertions.
const updateMock = vi.fn();
const selectMock = vi.fn(() => ({
  data: { settings: { foo: 'bar', payments: { stripe_active: true } } },
  error: null,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(selectMock()),
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
    const res = await setPaymentMode(fd({ mode: 'card_test', tenantId: 't1' }));
    expect(res).toEqual({ ok: false, error: 'forbidden_owner_only' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('persists settings.payments.mode for OWNER, preserving sibling keys', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'owner@x.com' },
      tenant: { id: 't1' },
    });
    getTenantRoleMock.mockResolvedValue('OWNER');
    const res = await setPaymentMode(fd({ mode: 'card_test', tenantId: 't1' }));
    expect(res).toEqual({ ok: true, mode: 'card_test' });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [patch] = updateMock.mock.calls[0];
    // Sibling top-level keys preserved + payments.* preserved.
    expect((patch.settings as Record<string, unknown>).foo).toBe('bar');
    expect(
      ((patch.settings as Record<string, unknown>).payments as Record<string, unknown>).stripe_active,
    ).toBe(true);
    expect(
      ((patch.settings as Record<string, unknown>).payments as Record<string, unknown>).mode,
    ).toBe('card_test');
  });

  it('allows platform-admin callers who are not tenant members', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: 'u1', email: 'platform@hir.ro' },
      tenant: { id: 't1' },
    });
    isPlatformAdminEmailMock.mockReturnValue(true);
    // getTenantRole should NOT be called for platform admins — gate falls
    // through to the write path.
    const res = await setPaymentMode(fd({ mode: 'card_live', tenantId: 't1' }));
    expect(res).toEqual({ ok: true, mode: 'card_live' });
    expect(getTenantRoleMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
