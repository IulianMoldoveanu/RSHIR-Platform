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
  courierRow: null as null | { user_id: string; full_name: string },
  incidentRow: null as null | { id: string; title: string },
  assignmentRow: null as null | { id: string; role: string },
  setCityActiveResult: { ok: true } as { ok: true } | { ok: false; error: string },
  setTenantStatusResult: { ok: true, status: 'SUSPENDED' } as { ok: true; status: string } | { ok: false; error: string },
  setTenantCityResult: { ok: true, cityName: 'Cluj-Napoca' } as { ok: true; cityName: string } | { ok: false; error: string },
  capitalsResult: { ok: true, activated: 41 } as { ok: true; activated: number } | { ok: false; error: string },
  verifyFleetKyfResult: { ok: true } as { ok: true } | { ok: false; error: string },
  verifyCourierKycResult: { ok: true } as { ok: true } | { ok: false; error: string },
  assignFleetResult: { ok: true, assignment_id: 'a1' } as { ok: true; assignment_id?: string } | { ok: false; error: string },
  markStrikeResult: { ok: true, strike_count: 3, auto_paused: false } as { ok: true; strike_count: number; auto_paused: boolean } | { ok: false; error: string },
  promoteResult: { ok: true, assignment_id: 'a1' } as { ok: true; assignment_id?: string } | { ok: false; error: string },
  terminateResult: { ok: true, assignment_id: 'a1' } as { ok: true; assignment_id?: string } | { ok: false; error: string },
  createPartnerResult: { ok: true } as { ok: true } | { ok: false; error: string },
  billingResult: { ok: true, created: 2 } as { ok: true; created?: number } | { ok: false; error: string },
  createIncidentResult: { ok: true, incidentId: 'i1' } as { ok: true; incidentId: string } | { ok: false; error: string },
  updateIncidentResult: { ok: true, incidentId: 'i1' } as { ok: true; incidentId: string } | { ok: false; error: string },
  addFleetManagerResult: { ok: true } as { ok: true } | { ok: false; error: string },
  createTenantResult: { ok: true, tenantId: 't9', ownerUserId: 'u9', slug: 'x', tempPassword: 'pw', storefrontUrl: 'https://x.ro' } as
    | { ok: true; tenantId: string; ownerUserId: string; slug: string; tempPassword: string; storefrontUrl: string }
    | { ok: false; error: string },
  createSiblingResult: { ok: true, newTenantId: 't10', newTenantName: 'X B', newTenantSlug: 'x-b', clonedCategories: 1, clonedItems: 5, clonedModifiers: 0, ownersAdded: 1 } as
    | { ok: true; newTenantId: string; newTenantName: string; newTenantSlug: string; clonedCategories: number; clonedItems: number; clonedModifiers: number; ownersAdded: number }
    | { ok: false; error: string },
  setCityActive: vi.fn((_a?: unknown) => undefined),
  activateCountyCapitals: vi.fn(() => undefined),
  setTenantStatus: vi.fn((_a?: unknown) => undefined),
  setTenantCity: vi.fn((_a?: unknown) => undefined),
  verifyFleetKyf: vi.fn((_a?: unknown, _b?: unknown, _c?: unknown) => undefined),
  verifyCourierKyc: vi.fn((_a?: unknown, _b?: unknown, _c?: unknown) => undefined),
  assignFleet: vi.fn((_a?: unknown) => undefined),
  markStrike: vi.fn((_a?: unknown) => undefined),
  promoteToPrimary: vi.fn((_a?: unknown) => undefined),
  terminateAssignment: vi.fn((_a?: unknown) => undefined),
  createPartner: vi.fn((_a?: unknown) => undefined),
  generatePreviousWeek: vi.fn(() => undefined),
  createIncident: vi.fn((_a?: unknown) => undefined),
  updateIncidentStatus: vi.fn((_a?: unknown) => undefined),
  addFleetManagerMembership: vi.fn((_a?: unknown) => undefined),
  createTenantWithOwner: vi.fn((_a?: unknown) => undefined),
  createSiblingLocationAction: vi.fn((_a?: unknown) => undefined),
}));

vi.mock('@/app/dashboard/admin/cities/actions', () => ({
  setCityActive: async (a: unknown) => { h.setCityActive(a); return h.setCityActiveResult; },
  activateCountyCapitals: async () => { h.activateCountyCapitals(); return h.capitalsResult; },
}));
vi.mock('@/app/dashboard/admin/tenants/actions', () => ({
  setTenantStatus: async (a: unknown) => { h.setTenantStatus(a); return h.setTenantStatusResult; },
  setTenantCity: async (a: unknown) => { h.setTenantCity(a); return h.setTenantCityResult; },
}));
vi.mock('@/app/dashboard/admin/verifications/actions', () => ({
  verifyFleetKyf: async (a: unknown, b: unknown, c: unknown) => { h.verifyFleetKyf(a, b, c); return h.verifyFleetKyfResult; },
  verifyCourierKyc: async (a: unknown, b: unknown, c: unknown) => { h.verifyCourierKyc(a, b, c); return h.verifyCourierKycResult; },
}));
vi.mock('@/app/dashboard/admin/fleet-allocation/actions', () => ({
  assignFleet: async (a: unknown) => { h.assignFleet(a); return h.assignFleetResult; },
  markStrike: async (a: unknown) => { h.markStrike(a); return h.markStrikeResult; },
  promoteToPrimary: async (a: unknown) => { h.promoteToPrimary(a); return h.promoteResult; },
  terminateAssignment: async (a: unknown) => { h.terminateAssignment(a); return h.terminateResult; },
}));
vi.mock('@/app/dashboard/admin/partners/actions', () => ({
  createPartner: async (a: unknown) => { h.createPartner(a); return h.createPartnerResult; },
}));
vi.mock('@/app/dashboard/admin/connect-billing/actions', () => ({
  generatePreviousWeek: async () => { h.generatePreviousWeek(); return h.billingResult; },
}));
vi.mock('@/app/dashboard/admin/incidents/actions', () => ({
  createIncident: async (a: unknown) => { h.createIncident(a); return h.createIncidentResult; },
  updateIncidentStatus: async (a: unknown) => { h.updateIncidentStatus(a); return h.updateIncidentResult; },
}));
vi.mock('@/app/dashboard/admin/fleet-managers/actions', () => ({
  addFleetManagerMembership: async (a: unknown) => { h.addFleetManagerMembership(a); return h.addFleetManagerResult; },
}));
vi.mock('@/app/dashboard/admin/onboard/actions', () => ({
  createTenantWithOwner: async (a: unknown) => { h.createTenantWithOwner(a); return h.createTenantResult; },
}));
vi.mock('@/app/dashboard/admin/onboard/sibling/actions', () => ({
  createSiblingLocationAction: async (a: unknown) => { h.createSiblingLocationAction(a); return h.createSiblingResult; },
}));

// Chainable query mock: select/eq/ilike return the builder; maybeSingle → single
// row, limit → array. The row depends on the table being queried.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const row =
        table === 'cities' ? h.cityRow
        : table === 'courier_fleets' ? h.fleetRow
        : table === 'courier_profiles' ? h.courierRow
        : table === 'public_incidents' ? h.incidentRow
        : table === 'fleet_restaurant_assignments' ? h.assignmentRow
        : h.tenantRow;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.ilike = () => b;
      b.maybeSingle = () => Promise.resolve({ data: row, error: null });
      b.limit = () => Promise.resolve({ data: row ? [row] : [], error: null });
      return b;
    },
  }),
}));

import { validateAction, getAction, WRITE_TOOL_IDS, writeToolSpecs } from './action-registry';

beforeEach(() => {
  for (const k of [
    'setCityActive', 'activateCountyCapitals', 'setTenantStatus', 'setTenantCity', 'verifyFleetKyf', 'verifyCourierKyc',
    'assignFleet', 'markStrike', 'promoteToPrimary', 'terminateAssignment', 'createPartner', 'generatePreviousWeek',
    'createIncident', 'updateIncidentStatus', 'addFleetManagerMembership', 'createTenantWithOwner', 'createSiblingLocationAction',
  ] as const) {
    h[k].mockClear();
  }
  h.cityRow = null;
  h.tenantRow = null;
  h.fleetRow = null;
  h.courierRow = null;
  h.incidentRow = null;
  h.assignmentRow = null;
});

describe('validateAction (whitelist + schema)', () => {
  it('rejects an unknown action', () => {
    expect(validateAction('rm_rf_everything', {}).ok).toBe(false);
  });

  it('rejects activate_city without a city', () => {
    expect(validateAction('activate_city', {}).ok).toBe(false);
  });

  it('rejects set_tenant_status with a bad status', () => {
    expect(validateAction('set_tenant_status', { tenant: 'x', status: 'DELETE' }).ok).toBe(false);
  });

  it('rejects verify_fleet_kyf with an invalid decision', () => {
    expect(validateAction('verify_fleet_kyf', { fleet: 'Dodo', decision: 'MAYBE' }).ok).toBe(false);
  });

  it('rejects create_partner with a malformed email', () => {
    expect(validateAction('create_partner', { name: 'Acme', email: 'nope', commissionPct: 10 }).ok).toBe(false);
  });

  it('rejects verify_courier_kyc with a bad decision', () => {
    expect(validateAction('verify_courier_kyc', { courier: 'Ion', decision: 'HMM' }).ok).toBe(false);
  });

  it('rejects create_incident with a bad severity', () => {
    expect(validateAction('create_incident', { title: 'Down', status: 'investigating', severity: 'apocalyptic', affectedServices: ['api'] }).ok).toBe(false);
  });

  it('rejects onboard_vendor with a malformed email', () => {
    expect(validateAction('onboard_vendor', { email: 'x', restaurantName: 'Acme', slug: 'acme' }).ok).toBe(false);
  });

  it('accepts a valid onboard_vendor', () => {
    expect(validateAction('onboard_vendor', { email: 'a@b.ro', restaurantName: 'Acme', slug: 'acme-cluj' }).ok).toBe(true);
  });
});

describe('execute wiring', () => {
  it('verify_courier_kyc resolves the courier and calls verifyCourierKyc', async () => {
    h.courierRow = { user_id: 'u1', full_name: 'Ion Pop' };
    const res = await getAction('verify_courier_kyc')!.execute({ courier: 'Ion', decision: 'VERIFIED' });
    expect(h.verifyCourierKyc).toHaveBeenCalledWith('u1', 'VERIFIED', undefined);
    expect(res.ok).toBe(true);
  });

  it('verify_fleet_kyf resolves the fleet and calls verifyFleetKyf', async () => {
    h.fleetRow = { id: 'f1', name: 'Dodo Courier' };
    const res = await getAction('verify_fleet_kyf')!.execute({ fleet: 'Dodo', decision: 'VERIFIED' });
    expect(h.verifyFleetKyf).toHaveBeenCalledWith('f1', 'VERIFIED', undefined);
    expect(res.ok).toBe(true);
  });

  it('set_incident_status resolves incident by title and calls updateIncidentStatus', async () => {
    h.incidentRow = { id: 'i1', title: 'API latency' };
    const res = await getAction('set_incident_status')!.execute({ incident: 'API', status: 'resolved' });
    expect(h.updateIncidentStatus).toHaveBeenCalledWith({ incidentId: 'i1', status: 'resolved', note: undefined });
    expect(res.ok).toBe(true);
  });

  it('promote_fleet_primary resolves the active assignment and calls promoteToPrimary', async () => {
    h.fleetRow = { id: 'f1', name: 'Dodo' };
    h.tenantRow = { id: 't1', name: 'Foisorul A', slug: 'foisorul-a' };
    h.assignmentRow = { id: 'asg1', role: 'secondary' };
    const res = await getAction('promote_fleet_primary')!.execute({ fleet: 'Dodo', tenant: 'foisorul-a' });
    expect(h.promoteToPrimary).toHaveBeenCalledWith({ assignment_id: 'asg1' });
    expect(res.ok).toBe(true);
  });

  it('terminate_fleet_assignment fails gracefully with no active assignment', async () => {
    h.fleetRow = { id: 'f1', name: 'Dodo' };
    h.tenantRow = { id: 't1', name: 'Foisorul A', slug: 'foisorul-a' };
    h.assignmentRow = null;
    const res = await getAction('terminate_fleet_assignment')!.execute({ fleet: 'Dodo', tenant: 'foisorul-a' });
    expect(res.ok).toBe(false);
    expect(h.terminateAssignment).not.toHaveBeenCalled();
  });

  it('grant_fleet_manager resolves tenant and calls addFleetManagerMembership', async () => {
    h.tenantRow = { id: 't1', name: 'Foisorul A', slug: 'foisorul-a' };
    const res = await getAction('grant_fleet_manager')!.execute({ email: 'fm@x.ro', tenant: 'foisorul-a' });
    expect(h.addFleetManagerMembership).toHaveBeenCalledWith({ email: 'fm@x.ro', tenant_id: 't1' });
    expect(res.ok).toBe(true);
  });

  it('onboard_vendor calls createTenantWithOwner and surfaces storefront + temp password', async () => {
    const res = await getAction('onboard_vendor')!.execute({ email: 'a@b.ro', restaurantName: 'Acme', slug: 'acme-cluj' });
    expect(h.createTenantWithOwner).toHaveBeenCalledWith({ email: 'a@b.ro', restaurantName: 'Acme', slug: 'acme-cluj', phone: undefined, cityId: undefined, address: undefined, tagline: undefined });
    expect(res.ok).toBe(true);
    expect(res.message).toContain('https://x.ro');
  });

  it('create_sibling_location resolves the root brand and calls createSiblingLocationAction', async () => {
    h.tenantRow = { id: 'root1', name: 'Acme', slug: 'acme' };
    const res = await getAction('create_sibling_location')!.execute({ rootTenant: 'acme', name: 'Acme Brașov', slug: 'acme-brasov' });
    expect(h.createSiblingLocationAction).toHaveBeenCalledWith({ rootTenantId: 'root1', name: 'Acme Brașov', slug: 'acme-brasov', cityId: null, cloneMenu: true, cloneBranding: true });
    expect(res.ok).toBe(true);
  });
});

describe('tool specs', () => {
  it('exposes one tool spec per registered action with matching ids', () => {
    const specs = writeToolSpecs();
    expect(specs.length).toBe(WRITE_TOOL_IDS.size);
    for (const s of specs) expect(WRITE_TOOL_IDS.has(s.name)).toBe(true);
  });

  it('includes the Etapa 3 action ids', () => {
    for (const id of ['verify_courier_kyc', 'create_incident', 'set_incident_status', 'promote_fleet_primary', 'terminate_fleet_assignment', 'grant_fleet_manager', 'onboard_vendor', 'create_sibling_location']) {
      expect(WRITE_TOOL_IDS.has(id)).toBe(true);
    }
  });
});
