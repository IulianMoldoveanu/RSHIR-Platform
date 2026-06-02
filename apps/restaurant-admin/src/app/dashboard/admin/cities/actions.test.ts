// Unit tests for Command Center city-activation server actions.
//
// Mocks the platform-admin guard + admin Supabase client + audit + cache, then
// exercises:
//   - setCityActive: non-admin (403) never writes; activate → is_active=true +
//     'city.activated' audit; deactivate → 'city.deactivated'; bad uuid → no write
//   - activateCountyCapitals: non-admin refusal; happy path returns count +
//     audits the bulk; the slug list is exactly the 41 unique county capitals

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (declared before the SUT import) ─────────────────────────

const requirePlatformAdminMock = vi.fn();
vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

const updateMock = vi.fn();
const singleResultMock = vi.fn();
const bulkResultMock = vi.fn();
const inSlugsCapture = vi.fn();
const auditMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      update: (patch: Record<string, unknown>) => {
        updateMock(patch);
        return {
          // setCityActive: .eq('id', id).select(...).maybeSingle()
          eq: (_c: string, _v: string) => ({
            select: () => ({
              maybeSingle: () => Promise.resolve(singleResultMock()),
            }),
          }),
          // activateCountyCapitals: .in('slug', [...]).select('id')
          in: (_c: string, arr: string[]) => {
            inSlugsCapture(arr);
            return { select: () => Promise.resolve(bulkResultMock()) };
          },
        };
      },
    }),
  }),
}));

vi.mock('@/lib/audit', () => ({
  logAudit: (row: unknown) => {
    auditMock(row);
    return Promise.resolve();
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ── Import the SUT after mocks ──────────────────────────────────

import { setCityActive, activateCountyCapitals } from './actions';

const ADMIN = { ok: true as const, userId: 'user-admin-1', email: 'iulianm698@gmail.com' };
const FORBIDDEN = { ok: false as const, status: 403 as const, error: 'forbidden' };
const CITY_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  requirePlatformAdminMock.mockReset();
  updateMock.mockReset();
  singleResultMock.mockReset();
  bulkResultMock.mockReset();
  inSlugsCapture.mockReset();
  auditMock.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe('setCityActive', () => {
  it('non-admin is refused before any write', async () => {
    requirePlatformAdminMock.mockResolvedValue(FORBIDDEN);
    const res = await setCityActive({ cityId: CITY_ID, active: true });
    expect(res.ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid cityId without writing', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    const res = await setCityActive({ cityId: 'not-a-uuid', active: true });
    expect(res.ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('activate writes is_active=true and audits city.activated', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    singleResultMock.mockReturnValue({ data: { id: CITY_ID, name: 'Cluj-Napoca', slug: 'cluj-napoca' }, error: null });
    const res = await setCityActive({ cityId: CITY_ID, active: true });
    expect(res.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ is_active: true });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'city.activated', entityId: CITY_ID }));
  });

  it('deactivate audits city.deactivated', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    singleResultMock.mockReturnValue({ data: { id: CITY_ID, name: 'Sulina', slug: 'sulina' }, error: null });
    const res = await setCityActive({ cityId: CITY_ID, active: false });
    expect(res.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ is_active: false });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'city.deactivated' }));
  });
});

describe('activateCountyCapitals', () => {
  it('non-admin is refused before any write', async () => {
    requirePlatformAdminMock.mockResolvedValue(FORBIDDEN);
    const res = await activateCountyCapitals();
    expect(res.ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('activates the 41 unique county capitals and reports the count', async () => {
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    bulkResultMock.mockReturnValue({ data: Array.from({ length: 41 }, (_, i) => ({ id: `c-${i}` })), error: null });
    const res = await activateCountyCapitals();
    expect(res).toEqual({ ok: true, activated: 41 });
    expect(updateMock).toHaveBeenCalledWith({ is_active: true });

    const slugs = inSlugsCapture.mock.calls[0][0] as string[];
    expect(slugs).toHaveLength(41);
    expect(new Set(slugs).size).toBe(41); // no duplicates
    expect(slugs).toContain('bucuresti');
    expect(slugs).toContain('ramnicu-valcea');
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'city.activated', metadata: expect.objectContaining({ bulk: 'county_capitals' }) }),
    );
  });
});
