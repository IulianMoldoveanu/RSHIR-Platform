// Unit tests for partner payout server actions.
//
// We mock the platform-admin guard + the admin Supabase client + audit
// helper, then exercise:
//   - happy path (PLATFORM_ADMIN): insert succeeds, audit row written
//   - duplicate-month: unique-violation code 23505 surfaces a friendly RO error
//   - non-admin (403): never reaches the DB write
//   - input validation (invalid period, negative gross, fee>gross, bad URL)
//   - voidPayoutAction: happy path + non-admin refusal

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (declared before the SUT import) ─────────────────────────

const requirePlatformAdminMock = vi.fn();
vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

const insertMock = vi.fn();
const updateMock = vi.fn();
const auditMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () => Promise.resolve(insertMock(row)),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, _val: string) => ({
          is: (_c: string, _v: null) => Promise.resolve(updateMock(patch)),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/audit', () => ({
  logAudit: (row: unknown) => {
    auditMock(row);
    return Promise.resolve();
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ── Import the SUT after mocks ──────────────────────────────────

import {
  markCommissionPaidAction,
  voidPayoutAction,
  __test__,
} from './payout-actions';

const ADMIN = {
  ok: true as const,
  userId: 'user-admin-1',
  email: 'iulianm698@gmail.com',
};

beforeEach(() => {
  requirePlatformAdminMock.mockReset();
  insertMock.mockReset();
  updateMock.mockReset();
  auditMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────

describe('normalizePeriodMonth', () => {
  it('coerces YYYY-MM to first-of-month', () => {
    expect(__test__.normalizePeriodMonth('2026-04')).toBe('2026-04-01');
  });

  it('accepts YYYY-MM-01', () => {
    expect(__test__.normalizePeriodMonth('2026-04-01')).toBe('2026-04-01');
  });

  it('rejects bad input', () => {
    expect(__test__.normalizePeriodMonth('2026-13')).toBeNull();
    expect(__test__.normalizePeriodMonth('2026-04-15')).toBeNull();
    expect(__test__.normalizePeriodMonth('not a date')).toBeNull();
    expect(__test__.normalizePeriodMonth('')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// markCommissionPaidAction
// ────────────────────────────────────────────────────────────

describe('markCommissionPaidAction', () => {
  const partnerId = '11111111-1111-1111-1111-111111111111';

  it('happy path: inserts row + writes audit (PLATFORM_ADMIN)', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    insertMock.mockResolvedValue({ data: { id: 'payout-1' }, error: null });

    const res = await markCommissionPaidAction({
      partner_id: partnerId,
      period_month: '2026-04',
      gross_cents: 5000,
      platform_fee_cents: 200,
      proof_url: 'https://drive.example.com/receipt.pdf',
      notes: 'Bank transfer ref #123',
    });

    expect(res).toEqual({ ok: true, payoutId: 'payout-1' });
    expect(insertMock).toHaveBeenCalledOnce();
    const row = insertMock.mock.calls[0][0];
    expect(row.partner_id).toBe(partnerId);
    expect(row.period_month).toBe('2026-04-01');
    expect(row.gross_cents).toBe(5000);
    expect(row.platform_fee_cents).toBe(200);
    expect(row.net_cents).toBe(4800);
    expect(row.paid_by_user_id).toBe(ADMIN.userId);
    expect(row.proof_url).toBe('https://drive.example.com/receipt.pdf');
    expect(auditMock).toHaveBeenCalledOnce();
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      action: 'partner.payout_marked_paid',
      entityId: 'payout-1',
    });
  });

  it('duplicate month: 23505 surfaces friendly RO error', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    insertMock.mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "partner_payouts_partner_month_active_unique"',
      },
    });

    const res = await markCommissionPaidAction({
      partner_id: partnerId,
      period_month: '2026-04',
      gross_cents: 5000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/payout activ/i);
    }
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('non-admin (403) → refuses without touching the DB', async () => {
    requirePlatformAdminMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'forbidden',
    });

    const res = await markCommissionPaidAction({
      partner_id: partnerId,
      period_month: '2026-04',
      gross_cents: 5000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/Acces interzis/);
    }
    expect(insertMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('rejects invalid period_month', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    const res = await markCommissionPaidAction({
      partner_id: partnerId,
      period_month: '2026-13',
      gross_cents: 100,
    });
    expect(res.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects negative gross_cents', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    const res = await markCommissionPaidAction({
      partner_id: partnerId,
      period_month: '2026-04',
      gross_cents: -5,
    });
    expect(res.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects platform_fee > gross', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    const res = await markCommissionPaidAction({
      partner_id: partnerId,
      period_month: '2026-04',
      gross_cents: 100,
      platform_fee_cents: 200,
    });
    expect(res.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects malformed proof_url', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    const res = await markCommissionPaidAction({
      partner_id: partnerId,
      period_month: '2026-04',
      gross_cents: 100,
      proof_url: 'javascript:alert(1)',
    });
    expect(res.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// voidPayoutAction
// ────────────────────────────────────────────────────────────

describe('voidPayoutAction', () => {
  it('happy path: soft-voids + writes audit (PLATFORM_ADMIN)', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    updateMock.mockResolvedValue({ error: null, data: null, count: 1 });

    const res = await voidPayoutAction({
      payout_id: 'payout-1',
      reason: 'wrong amount',
    });

    expect(res).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledOnce();
    const patch = updateMock.mock.calls[0][0];
    expect(patch.voided_by_user_id).toBe(ADMIN.userId);
    expect(patch.voided_reason).toBe('wrong amount');
    expect(typeof patch.voided_at).toBe('string');
    expect(auditMock).toHaveBeenCalledOnce();
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      action: 'partner.payout_voided',
      entityId: 'payout-1',
    });
  });

  it('non-admin (401) → refuses without touching DB', async () => {
    requirePlatformAdminMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'unauthorized',
    });
    const res = await voidPayoutAction({ payout_id: 'payout-1' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/Unauthentificat/);
    }
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('rejects missing payout_id', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    const res = await voidPayoutAction({ payout_id: '' });
    expect(res.ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
