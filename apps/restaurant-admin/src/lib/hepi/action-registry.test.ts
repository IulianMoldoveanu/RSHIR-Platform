// Registry = the action whitelist. These tests pin: only known actions pass,
// params are schema-validated, and an action wires through to its audited
// server action. Wrapped actions + supabase are mocked so this stays a unit.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Everything the (hoisted) vi.mock factories touch must itself be hoisted, or
// it's in the temporal dead zone when the factory runs at import time.
const h = vi.hoisted(() => ({
  cityRow: null as null | { id: string; name: string; slug: string },
  tenantRow: null as null | { id: string; name: string; slug: string },
  setCityActiveResult: { ok: true } as { ok: true } | { ok: false; error: string },
  setTenantStatusResult: { ok: true, status: 'SUSPENDED' } as
    | { ok: true; status: string }
    | { ok: false; error: string },
  capitalsResult: { ok: true, activated: 41 } as { ok: true; activated: number } | { ok: false; error: string },
  setCityActive: vi.fn((_a?: unknown) => undefined),
  activateCountyCapitals: vi.fn(() => undefined),
  setTenantStatus: vi.fn((_a?: unknown) => undefined),
}));

vi.mock('@/app/dashboard/admin/cities/actions', () => ({
  setCityActive: async (a: unknown) => {
    h.setCityActive(a);
    return h.setCityActiveResult;
  },
  activateCountyCapitals: async () => {
    h.activateCountyCapitals();
    return h.capitalsResult;
  },
}));
vi.mock('@/app/dashboard/admin/tenants/actions', () => ({
  setTenantStatus: async (a: unknown) => {
    h.setTenantStatus(a);
    return h.setTenantStatusResult;
  },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const row = table === 'cities' ? h.cityRow : h.tenantRow;
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
          ilike: () => ({ limit: () => Promise.resolve({ data: row ? [row] : [], error: null }) }),
        }),
      };
    },
  }),
}));

import { validateAction, getAction, WRITE_TOOL_IDS, writeToolSpecs } from './action-registry';

beforeEach(() => {
  h.setCityActive.mockClear();
  h.activateCountyCapitals.mockClear();
  h.setTenantStatus.mockClear();
  h.cityRow = null;
  h.tenantRow = null;
  h.setCityActiveResult = { ok: true };
  h.setTenantStatusResult = { ok: true, status: 'SUSPENDED' };
  h.capitalsResult = { ok: true, activated: 41 };
});

describe('validateAction (whitelist + schema)', () => {
  it('rejects an unknown action', () => {
    expect(validateAction('rm_rf_everything', {}).ok).toBe(false);
  });

  it('accepts activate_city with a city + builds confirm text', () => {
    const r = validateAction('activate_city', { city: 'cluj-napoca' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.describe).toContain('cluj-napoca');
  });

  it('rejects activate_city without a city', () => {
    expect(validateAction('activate_city', {}).ok).toBe(false);
  });

  it('rejects set_tenant_status with a bad status', () => {
    expect(validateAction('set_tenant_status', { tenant: 'x', status: 'DELETE' }).ok).toBe(false);
  });

  it('accepts a valid suspend and says so', () => {
    const r = validateAction('set_tenant_status', { tenant: 'foisorul-a', status: 'SUSPENDED' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.describe.toLowerCase()).toContain('suspend');
  });
});

describe('execute wiring', () => {
  it('activate_city resolves the city and calls setCityActive', async () => {
    h.cityRow = { id: 'c1', name: 'Cluj-Napoca', slug: 'cluj-napoca' };
    const res = await getAction('activate_city')!.execute({ city: 'cluj-napoca' });
    expect(h.setCityActive).toHaveBeenCalledWith({ cityId: 'c1', active: true });
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Cluj-Napoca');
  });

  it('activate_city fails gracefully when the city is unknown', async () => {
    h.cityRow = null;
    const res = await getAction('activate_city')!.execute({ city: 'atlantis' });
    expect(res.ok).toBe(false);
    expect(h.setCityActive).not.toHaveBeenCalled();
  });

  it('set_tenant_status resolves the tenant and calls setTenantStatus', async () => {
    h.tenantRow = { id: 't1', name: 'Foisorul A', slug: 'foisorul-a' };
    const res = await getAction('set_tenant_status')!.execute({ tenant: 'foisorul-a', status: 'SUSPENDED' });
    expect(h.setTenantStatus).toHaveBeenCalledWith({ tenantId: 't1', next: 'SUSPENDED' });
    expect(res.ok).toBe(true);
  });
});

describe('tool specs', () => {
  it('exposes one tool spec per registered action with matching ids', () => {
    const specs = writeToolSpecs();
    expect(specs.length).toBe(WRITE_TOOL_IDS.size);
    for (const s of specs) expect(WRITE_TOOL_IDS.has(s.name)).toBe(true);
  });
});
