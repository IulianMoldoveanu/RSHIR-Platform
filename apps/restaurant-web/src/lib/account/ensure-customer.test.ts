// Regression tests for ensureCustomerForAuthUser — the get-or-create bridge
// between a GLOBAL Supabase Auth identity (auth.users, shared across every
// tenant on the platform) and a TENANT-SCOPED customers row. Locks in:
//   - existing row found → no insert, returns it as-is
//   - no existing row → inserts, splitting full_name into first/last
//   - concurrent-insert race (unique violation) → recovers by re-fetching
//     instead of surfacing a spurious failure
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const selectMaybeSingleMock = vi.fn();
const insertSingleMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(selectMaybeSingleMock()),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve(insertSingleMock()),
        }),
      }),
    }),
  }),
}));

import { ensureCustomerForAuthUser } from './ensure-customer';

describe('ensureCustomerForAuthUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns the existing row without inserting when one is already linked', async () => {
    selectMaybeSingleMock.mockResolvedValueOnce({ data: { id: 'cust-1' }, error: null });

    const result = await ensureCustomerForAuthUser({
      tenantId: 'tenant-1',
      authUserId: 'auth-1',
      email: 'a@b.com',
      fullName: 'Ana Pop',
    });

    expect(result).toEqual({ ok: true, customerId: 'cust-1' });
    expect(insertSingleMock).not.toHaveBeenCalled();
  });

  it('creates a new row and splits full name into first/last on first login', async () => {
    selectMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    insertSingleMock.mockResolvedValueOnce({ data: { id: 'cust-new' }, error: null });

    const result = await ensureCustomerForAuthUser({
      tenantId: 'tenant-1',
      authUserId: 'auth-2',
      email: 'ana.pop@example.com',
      fullName: 'Ana Maria Pop',
    });

    expect(result).toEqual({ ok: true, customerId: 'cust-new' });
    expect(insertSingleMock).toHaveBeenCalledOnce();
  });

  it('handles a null full name without throwing', async () => {
    selectMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    insertSingleMock.mockResolvedValueOnce({ data: { id: 'cust-3' }, error: null });

    const result = await ensureCustomerForAuthUser({
      tenantId: 'tenant-1',
      authUserId: 'auth-3',
      email: 'noname@example.com',
      fullName: null,
    });

    expect(result).toEqual({ ok: true, customerId: 'cust-3' });
  });

  it('recovers from a concurrent-insert race (unique violation) by re-fetching', async () => {
    selectMaybeSingleMock
      .mockResolvedValueOnce({ data: null, error: null }) // initial lookup: not found yet
      .mockResolvedValueOnce({ data: { id: 'cust-won-race' }, error: null }); // recovery lookup
    insertSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const result = await ensureCustomerForAuthUser({
      tenantId: 'tenant-1',
      authUserId: 'auth-4',
      email: 'race@example.com',
      fullName: 'Race Condition',
    });

    expect(result).toEqual({ ok: true, customerId: 'cust-won-race' });
  });

  it('surfaces a genuine insert failure (not a race) as an error', async () => {
    selectMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    insertSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'foreign key violation' },
    });

    const result = await ensureCustomerForAuthUser({
      tenantId: 'tenant-1',
      authUserId: 'auth-5',
      email: 'fail@example.com',
      fullName: 'Fail Case',
    });

    expect(result.ok).toBe(false);
  });
});
