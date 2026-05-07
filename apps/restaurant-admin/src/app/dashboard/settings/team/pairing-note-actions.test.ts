// Unit tests for pairing-note-actions input sanitizers + the
// column-level guard. The guard test exercises the FLEET_MANAGER role
// branch so we catch regressions where setNoteFromFleet would refuse to
// write because of the legacy getTenantRole coercion.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (declared before the SUT import) ─────────────────────────

const getActiveTenantMock = vi.fn();
vi.mock('@/lib/tenant', () => ({
  getActiveTenant: () => getActiveTenantMock(),
}));

const memberLookupMock = vi.fn();
const memberUpdateMock = vi.fn();
const auditInsertMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'audit_log') {
        return {
          insert: (row: unknown) => {
            auditInsertMock(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      // tenant_members
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(memberLookupMock()),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                select: () => Promise.resolve(memberUpdateMock(patch, 3)),
              }),
            }),
            // shorter chain (OWNER write, only 2 .eq() calls before the bare update)
            // Re-export update result so the second .eq() returns it.
          }),
        }),
      };
    },
  }),
}));

vi.mock('@/lib/audit', () => ({
  logAudit: (row: unknown) => {
    auditInsertMock(row);
    return Promise.resolve();
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ── Import the SUT after the mocks ──────────────────────────────────

import {
  __test__,
  setNoteFromFleet,
  setNoteFromOwner,
} from './pairing-note-actions';

const { sanitizeNote, sanitizePhone } = __test__;

beforeEach(() => {
  getActiveTenantMock.mockReset();
  memberLookupMock.mockReset();
  memberUpdateMock.mockReset();
  auditInsertMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Sanitizers ─────────────────────────────────────────────────────

describe('sanitizeNote', () => {
  it('returns null for null/empty/whitespace-only input', () => {
    expect(sanitizeNote(null)).toBeNull();
    expect(sanitizeNote(undefined)).toBeNull();
    expect(sanitizeNote('')).toBeNull();
    expect(sanitizeNote('   \n\t')).toBeNull();
  });

  it('preserves internal whitespace', () => {
    expect(sanitizeNote('Vă rugăm intrați  prin spate.')).toBe(
      'Vă rugăm intrați  prin spate.',
    );
  });

  it('caps at 2000 characters', () => {
    const long = 'a'.repeat(3000);
    expect(sanitizeNote(long)?.length).toBe(2000);
  });
});

describe('sanitizePhone', () => {
  it('strips disallowed characters', () => {
    expect(sanitizePhone('0712-345-678 alo')).toBe('0712-345-678');
    expect(sanitizePhone('+40 723 abc 111')).toBe('+40 723  111');
  });

  it('returns null for empty/whitespace', () => {
    expect(sanitizePhone('')).toBeNull();
    expect(sanitizePhone('   ')).toBeNull();
  });

  it('caps at 32 characters', () => {
    expect(sanitizePhone('1'.repeat(60))?.length).toBe(32);
  });
});

// ── Column-level write guard for setNoteFromFleet ──────────────────

describe('setNoteFromFleet', () => {
  const TENANT_ID = 'tenant-aaa';
  const FM_USER_ID = 'fm-1';

  it('refuses when active tenant differs from expectedTenantId', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: FM_USER_ID },
      tenant: { id: TENANT_ID, name: 'X' },
    });
    const r = await setNoteFromFleet({
      expectedTenantId: 'tenant-bbb',
      note: 'hi',
    });
    expect(r).toEqual({
      ok: false,
      error: 'forbidden',
      detail: 'tenant_mismatch',
    });
  });

  it('refuses when tenant_members row says STAFF, not FLEET_MANAGER', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: FM_USER_ID },
      tenant: { id: TENANT_ID, name: 'X' },
    });
    memberLookupMock.mockResolvedValue({
      data: { role: 'STAFF' },
      error: null,
    });
    const r = await setNoteFromFleet({
      expectedTenantId: TENANT_ID,
      note: 'hi',
    });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
    expect(memberUpdateMock).not.toHaveBeenCalled();
  });
});

describe('setNoteFromOwner', () => {
  const TENANT_ID = 'tenant-aaa';
  const OWNER_ID = 'owner-1';

  it('refuses when caller is not OWNER', async () => {
    getActiveTenantMock.mockResolvedValue({
      user: { id: OWNER_ID },
      tenant: { id: TENANT_ID, name: 'X' },
    });
    memberLookupMock.mockResolvedValue({
      data: { role: 'STAFF' },
      error: null,
    });
    const r = await setNoteFromOwner({
      fmUserId: 'fm-target',
      expectedTenantId: TENANT_ID,
      note: 'hi',
    });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
    expect(memberUpdateMock).not.toHaveBeenCalled();
  });
});
