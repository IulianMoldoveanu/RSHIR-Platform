// Registry = the action whitelist. These tests pin: only known actions pass,
// params are schema-validated, and an action wires through to its audited
// server action. Wrapped actions + supabase are mocked so this stays a unit.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Everything the (hoisted) vi.mock factories touch must itself be hoisted, or
// it's in the temporal dead zone when the factory runs at import time.
const h = vi.hoisted(() => ({
  cityRow: null as null | { id: string; name: string; slug: string },
  tenantRow: null as null | { id: string; name: string; slug: string },
  fleetRow: null as null | { id: string; name: string },
  setCityActiveResult: { ok: true } as { ok: true } | { ok: false; error: string },
  setTenantStatusResult: { ok: true, status: 'SUSPENDED' } as
    | { ok: true; status: string }
    | { ok: false; error: string },
  setTenantCityResult: { ok: true, cityName: 'Cluj-Napoca' } as
    | { ok: true; cityName: string }
    | { ok: false; error: string },
  capitalsResult: { ok: true, activated: 41 } as { ok: true; activated: number } | { ok: false; error: string },
  verifyFleetKyfResult: { ok: true } as { ok: true } | { ok: false; error: string },
  assignFleetResult: { ok: true, assignment_id: 'a1' } as { ok: true; assignment_id?: string } | { ok: false; error: string },
  markStrikeResult: { ok: true, strike_count: 3, auto_paused: false } as
    | { ok: true; strike_count: number; auto_paused: boolean }
    | { ok: false; error: string },
  createPartnerResult: { ok: true } as { ok: true } | { ok: false; error: string },
  billingResult: { ok: true, created: 2 } as { ok: true; created?: number } | { ok: false; error: string },
  setCityActive: vi.fn((_a?: unknown) => undefined),
  activateCountyCapitals: vi.fn(() => undefined),
  setTenantStatus: vi.fn((_a?: unknown) => undefined),
  setTenantCity: vi.fn((_a?: unknown) => undefined),
  verifyFleetKyf: vi.fn((_a?: unknown, _b?: unknown, _c?: unknown) => undefined),
  assignFleet: vi.fn((_a?: unknown) => undefined),
  markStrike: vi.fn((_a?: unknown) => undefined),
  createPartner: vi.fn((_a?: unknown) => undefined),
  generatePreviousWeek: vi.fn(() => undefined),
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
  setTenantCity: async (a: unknown) => {
    h.setTenantCity(a);
    return h.setTenantCityResult;
  },
}));
vi.mock('@/app/dashboard/admin/verifications/actions', () => ({
  verifyFleetKyf: async (a: unknown, b: unknown, c: unknown) => {
    h.verifyFleetKyf(a, b, c);
    return h.verifyFleetKyfResult;
  },
}));
vi.mock('@/app/dashboard/admin/fleet-allocation/actions', () => ({
  assignFleet: async (a: unknown) => {
    h.assignFleet(a);
    return h.assignFleetResult;
  },
  markStrike: async (a: unknown) => {
    h.markStrike(a);
    return h.markStrikeResult;
  },
}));
vi.mock('@/app/dashboard/admin/partners/actions', () => ({
  createPartner: async (a: unknown) => {
    h.createPartner(a);
    return h.createPartnerResult;
  },
}));
vi.mock('@/app/dashboard/admin/connect-billing/actions', () => ({
  generatePreviousWeek: async () => {
    h.generatePreviousWeek();
    return h.billingResult;
  },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const row = table === 'cities' ? h.cityRow : table === 'courier_fleets' ? h.fleetRow : h.tenantRow;
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
  for (const k of ['setCityActive', 'activateCountyCapitals', 'setTenantStatus', 'setTenantCity', 'verifyFleetKyf', 'assignFleet', 'markStrike', 'createPartner', 'generatePreviousWeek'] as const) {
    h[k].mockClear();
  }
  h.cityRow = null;
  h.tenantRow = null;
  h.fleetRow = null;
  h.setCityActiveResult = { ok: true };
  h.setTenantStatusResult = { ok: true, status: 'SUSPENDED' };
  h.setTenantCityResult = { ok: true, cityName: 'Cluj-Napoca' };
  h.capitalsResult = { ok: true, activated: 41 };
  h.verifyFleetKyfResult = { ok: true };
  h.assignFleetResult = { ok: true, assignment_id: 'a1' };
  h.markStrikeResult = { ok: true, strike_count: 3, auto_paused: false };
  h.createPartnerResult = { ok: true };
  h.billingResult = { ok: true, created: 2 };
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

  it('rejects verify_fleet_kyf with an invalid decision', () => {
    expect(validateAction('verify_fleet_kyf', { fleet: 'Dodo', decision: 'MAYBE' }).ok).toBe(false);
  });

  it('rejects assign_fleet with an invalid role', () => {
    expect(validateAction('assign_fleet', { fleet: 'Dodo', tenant: 'foisorul-a', role: 'tertiary' }).ok).toBe(false);
  });

  it('rejects create_partner with a malformed email', () => {
    expect(validateAction('create_partner', { name: 'Acme', email: 'not-an-email', commissionPct: 10 }).ok).toBe(false);
  });

  it('accepts generate_connect_invoices with no params', () => {
    expect(validateAction('generate_connect_invoices', {}).ok).toBe(true);
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

  it('verify_fleet_kyf resolves the fleet and calls verifyFleetKyf', async () => {
    h.fleetRow = { id: 'f1', name: 'Dodo Courier' };
    const res = await getAction('verify_fleet_kyf')!.execute({ fleet: 'Dodo', decision: 'VERIFIED' });
    expect(h.verifyFleetKyf).toHaveBeenCalledWith('f1', 'VERIFIED', undefined);
    expect(res.ok).toBe(true);
  });

  it('assign_fleet resolves both fleet + tenant and calls assignFleet', async () => {
    h.fleetRow = { id: 'f1', name: 'Dodo Courier' };
    h.tenantRow = { id: 't1', name: 'Foisorul A', slug: 'foisorul-a' };
    const res = await getAction('assign_fleet')!.execute({ fleet: 'Dodo', tenant: 'foisorul-a', role: 'primary' });
    expect(h.assignFleet).toHaveBeenCalledWith({ fleet_id: 'f1', restaurant_tenant_id: 't1', role: 'primary' });
    expect(res.ok).toBe(true);
  });

  it('create_partner calls createPartner with the right shape', async () => {
    const res = await getAction('create_partner')!.execute({ name: 'Acme', email: 'a@b.ro', commissionPct: 12 });
    expect(h.createPartner).toHaveBeenCalledWith({ name: 'Acme', email: 'a@b.ro', phone: undefined, default_commission_pct: 12 });
    expect(res.ok).toBe(true);
  });

  it('generate_connect_invoices calls generatePreviousWeek', async () => {
    const res = await getAction('generate_connect_invoices')!.execute({});
    expect(h.generatePreviousWeek).toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });
});

describe('tool specs', () => {
  it('exposes one tool spec per registered action with matching ids', () => {
    const specs = writeToolSpecs();
    expect(specs.length).toBe(WRITE_TOOL_IDS.size);
    for (const s of specs) expect(WRITE_TOOL_IDS.has(s.name)).toBe(true);
  });

  it('includes the Etapa 2 action ids', () => {
    for (const id of ['set_tenant_city', 'assign_fleet', 'mark_fleet_strike', 'verify_fleet_kyf', 'create_partner', 'generate_connect_invoices']) {
      expect(WRITE_TOOL_IDS.has(id)).toBe(true);
    }
  });
});
