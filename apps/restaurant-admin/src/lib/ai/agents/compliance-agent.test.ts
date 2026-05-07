// Compliance Agent — Sprint 17 unit tests.
//
// Coverage map (per lane brief: 1 test per intent + mirror parity):
//   1. Mirror parity — COMPLIANCE_INTENT_NAMES matches Deno-side
//      registration; Zod result schemas accept canonical shapes.
//   2. compliance.anaf_efactura_health — happy path + missing-field
//      detection on a tenant with empty fiscal/efactura settings.
//   3. compliance.gdpr_data_audit — counts stale customers, samples PII
//      audit events, detects retention policy.
//   4. compliance.legea_95_pharmacy_check — short-circuits to
//      applicable=false on RESTAURANT vertical; produces reminders on
//      pharma vertical.
//
// All tests use a hand-rolled Supabase mock (same pattern as menu-agent
// Sprint 12) — no real network, no real DB, no Anthropic call (the
// compliance agent is fully deterministic in V0).

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  dispatchIntent,
  clearRegistryForTesting,
} from '../../../../../../supabase/functions/_shared/master-orchestrator';
import {
  registerComplianceAgentIntents,
  __TESTING__,
} from '../../../../../../supabase/functions/_shared/compliance-agent';
import {
  COMPLIANCE_INTENT_NAMES,
  GDPR_STALE_CUSTOMER_DAYS,
  anafEfacturaHealthResultSchema,
  gdprDataAuditResultSchema,
  legea95PharmacyCheckResultSchema,
} from './compliance-agent';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type TenantRow = {
  id: string;
  name?: string;
  vertical?: string;
  settings?: Record<string, unknown>;
};

type AuditRow = {
  action: string;
  entity_type: string | null;
  created_at: string;
};

type MockState = {
  tenant: TenantRow | null;
  staleCustomerCount: number;
  auditRows: AuditRow[];
  pharmaOrderCount: number;
  // Trust row used by the dispatcher when readOnly is false. Compliance
  // intents are all readOnly:true so this is unused, but the mock has
  // to handle the table for the dispatch end-to-end test.
  trustLevel: 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';
};

function makeMockSupabase(state: MockState) {
  return {
    from: (tableName: string) => {
      if (tableName === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.tenant,
                error: null,
              }),
            }),
          }),
        };
      }
      if (tableName === 'customers') {
        return {
          select: (_cols: string, _opts?: { count?: string; head?: boolean }) => ({
            eq: () => ({
              lt: async () => ({ count: state.staleCustomerCount, error: null }),
            }),
          }),
        };
      }
      if (tableName === 'audit_log') {
        // Builder chain: .select().eq().gte().order().limit() => Promise<{data, error}>
        const terminal = async () => ({ data: state.auditRows, error: null });
        const limitFn = (_n: number) => terminal();
        const orderFn = () => ({ limit: limitFn });
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                order: orderFn,
              }),
            }),
          }),
        };
      }
      if (tableName === 'restaurant_orders') {
        return {
          select: (_cols: string, _opts?: { count?: string; head?: boolean }) => ({
            eq: () => ({
              gte: async () => ({ count: state.pharmaOrderCount, error: null }),
            }),
          }),
        };
      }
      if (tableName === 'tenant_agent_trust') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { trust_level: state.trustLevel, is_destructive: false },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (tableName === 'copilot_agent_runs') {
        return {
          insert: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: 'ledger-id' }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${tableName}`);
    },
  };
}

function defaultState(): MockState {
  return {
    tenant: null,
    staleCustomerCount: 0,
    auditRows: [],
    pharmaOrderCount: 0,
    trustLevel: 'PROPOSE_ONLY',
  };
}

beforeEach(() => {
  clearRegistryForTesting();
});

afterEach(() => {
  clearRegistryForTesting();
});

// ---------------------------------------------------------------------------
// Mirror parity
// ---------------------------------------------------------------------------

describe('compliance-agent / mirror', () => {
  test('COMPLIANCE_INTENT_NAMES matches expected names + Zod schemas accept canonical shapes', () => {
    expect(COMPLIANCE_INTENT_NAMES).toEqual([
      'compliance.anaf_efactura_health',
      'compliance.gdpr_data_audit',
      'compliance.legea_95_pharmacy_check',
    ]);

    // ANAF result — fully populated happy path.
    expect(
      anafEfacturaHealthResultSchema.safeParse({
        cif_present: true,
        cif_valid_format: true,
        vat_rate_set: true,
        vat_rate_pct: 11,
        efactura_enabled: true,
        efactura_step_completed: 4,
        last_test_status: 'OK',
        last_test_age_days: 3,
        missing_fields: [],
        recommendations: [],
      }).success,
    ).toBe(true);

    // GDPR result — empty-state happy path.
    expect(
      gdprDataAuditResultSchema.safeParse({
        stale_customers_count: 0,
        stale_customers_threshold_days: 365,
        pii_audit_events_count: 0,
        pii_audit_events_sample: [],
        retention_policy_set: true,
        retention_days: 730,
        recommendations: [],
      }).success,
    ).toBe(true);

    // Legea 95 result — both branches of the discriminated union.
    expect(
      legea95PharmacyCheckResultSchema.safeParse({
        applicable: false,
        vertical: 'restaurant',
      }).success,
    ).toBe(true);
    expect(
      legea95PharmacyCheckResultSchema.safeParse({
        applicable: true,
        vertical: 'pharma',
        pharma_orders_30d: 12,
        reminders: ['x'],
        pharmacist_signoff_field_present: false,
      }).success,
    ).toBe(true);

    // Zod rejects obvious garbage.
    expect(
      anafEfacturaHealthResultSchema.safeParse({
        cif_present: 'yes', // wrong type
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Intent 1 — anaf_efactura_health
// ---------------------------------------------------------------------------

describe('compliance.anaf_efactura_health', () => {
  test('reports missing CIF/VAT/efactura on a freshly-onboarded tenant', async () => {
    const state = defaultState();
    state.tenant = {
      id: 't1',
      name: 'FOISORUL A',
      vertical: 'RESTAURANT',
      settings: {}, // no fiscal, no efactura
    };
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.anafEfacturaHealthHandler.plan(ctx, {});
    expect(plan.actionCategory).toBe('compliance.read');

    const result = await __TESTING__.anafEfacturaHealthHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;

    expect(data.cif_present).toBe(false);
    expect(data.cif_valid_format).toBe(false);
    expect(data.vat_rate_set).toBe(false);
    expect(data.efactura_enabled).toBe(false);
    expect(data.efactura_step_completed).toBe(0);
    expect(data.last_test_status).toBe(null);
    expect(data.last_test_age_days).toBe(null);
    expect(data.missing_fields).toContain('cif');
    expect(data.missing_fields).toContain('vat_rate_pct');
    expect(data.missing_fields).toContain('efactura.enabled');
    expect(data.recommendations.length).toBeGreaterThan(0);
    // Schema parity check: result data must validate against the Zod
    // schema in the Node-side mirror.
    expect(anafEfacturaHealthResultSchema.safeParse(data).success).toBe(true);
  });

  test('returns clean payload on a fully-configured tenant', async () => {
    const state = defaultState();
    state.tenant = {
      id: 't2',
      name: 'Tenant Configurat',
      vertical: 'RESTAURANT',
      settings: {
        fiscal: { cui: '12345678', vat_rate_pct: 11, legal_name: 'SRL X' },
        efactura: {
          enabled: true,
          cif: '12345678',
          step_completed: 4,
          last_test_status: 'OK',
          last_test_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          environment: 'prod',
        },
      },
    };
    const ctx = {
      tenantId: 't2',
      channel: 'web' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.anafEfacturaHealthHandler.plan(ctx, {});
    const result = await __TESTING__.anafEfacturaHealthHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;

    expect(data.cif_present).toBe(true);
    expect(data.cif_valid_format).toBe(true);
    expect(data.vat_rate_set).toBe(true);
    expect(data.vat_rate_pct).toBe(11);
    expect(data.efactura_enabled).toBe(true);
    expect(data.efactura_step_completed).toBe(4);
    expect(data.last_test_status).toBe('OK');
    expect(data.last_test_age_days).toBeGreaterThanOrEqual(4);
    expect(data.last_test_age_days).toBeLessThanOrEqual(6);
    expect(data.missing_fields).toEqual([]);
    expect(data.recommendations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Intent 2 — gdpr_data_audit
// ---------------------------------------------------------------------------

describe('compliance.gdpr_data_audit', () => {
  test('counts stale customers + filters PII audit events + detects retention policy', async () => {
    const state = defaultState();
    state.tenant = {
      id: 't1',
      settings: { gdpr: { retention_days: 730 } },
    };
    state.staleCustomerCount = 7;
    state.auditRows = [
      // 3 PII matches, 2 non-matches.
      { action: 'customer.export', entity_type: 'customer', created_at: '2026-04-30T10:00:00Z' },
      { action: 'order.status_changed', entity_type: 'order', created_at: '2026-04-29T10:00:00Z' },
      { action: 'gdpr.redact_request', entity_type: 'customer', created_at: '2026-04-28T10:00:00Z' },
      { action: 'menu.item_updated', entity_type: 'menu_item', created_at: '2026-04-27T10:00:00Z' },
      { action: 'customer_phone.viewed', entity_type: 'customer', created_at: '2026-04-26T10:00:00Z' },
    ];

    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };

    const plan = await __TESTING__.gdprDataAuditHandler.plan(ctx, {});
    expect(plan.actionCategory).toBe('compliance.read');

    const result = await __TESTING__.gdprDataAuditHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;

    expect(data.stale_customers_count).toBe(7);
    expect(data.stale_customers_threshold_days).toBe(GDPR_STALE_CUSTOMER_DAYS);
    expect(data.pii_audit_events_count).toBe(3);
    expect(data.pii_audit_events_sample.length).toBe(3);
    expect(data.retention_policy_set).toBe(true);
    expect(data.retention_days).toBe(730);
    // Recommendations should NOT include the retention prompt (it's set)
    // but SHOULD include the stale-customer prompt and PII-events prompt.
    expect(data.recommendations.some((r: string) => /retenție/i.test(r))).toBe(false);
    expect(data.recommendations.some((r: string) => /clienți/i.test(r))).toBe(true);
    expect(data.recommendations.some((r: string) => /PII/.test(r))).toBe(true);
    // Schema parity check.
    expect(gdprDataAuditResultSchema.safeParse(data).success).toBe(true);

    // Sanity: the helper itself is correct.
    expect(__TESTING__.isPiiAction('customer.export')).toBe(true);
    expect(__TESTING__.isPiiAction('order.status_changed')).toBe(false);
    expect(__TESTING__.isPiiAction('gdpr.redact_request')).toBe(true);
    expect(__TESTING__.isPiiAction('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Intent 3 — legea_95_pharmacy_check
// ---------------------------------------------------------------------------

describe('compliance.legea_95_pharmacy_check', () => {
  test('short-circuits applicable=false for restaurant tenants', async () => {
    const state = defaultState();
    state.tenant = { id: 't1', vertical: 'RESTAURANT', settings: {} };
    const ctx = {
      tenantId: 't1',
      channel: 'web' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.legea95PharmacyCheckHandler.plan(ctx, {});
    const result = await __TESTING__.legea95PharmacyCheckHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.applicable).toBe(false);
    expect(data.vertical).toBe('restaurant');
    expect(legea95PharmacyCheckResultSchema.safeParse(data).success).toBe(true);
  });

  test('emits Legea 95 reminders for pharma tenants + flags missing signoff field', async () => {
    const state = defaultState();
    state.tenant = {
      id: 't2',
      vertical: 'pharma',
      settings: {}, // no pharmacy.signoff_field_present
    };
    state.pharmaOrderCount = 42;
    const ctx = {
      tenantId: 't2',
      channel: 'web' as const,
      actorUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: makeMockSupabase(state) as any,
    };
    const plan = await __TESTING__.legea95PharmacyCheckHandler.plan(ctx, {});
    const result = await __TESTING__.legea95PharmacyCheckHandler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.applicable).toBe(true);
    expect(data.vertical).toBe('pharma');
    expect(data.pharma_orders_30d).toBe(42);
    expect(data.pharmacist_signoff_field_present).toBe(false);
    expect(data.reminders.length).toBeGreaterThanOrEqual(5);
    expect(data.reminders.some((r: string) => /Legea 95/i.test(r))).toBe(true);
    expect(data.reminders.some((r: string) => /sign-off/i.test(r))).toBe(true);
    expect(legea95PharmacyCheckResultSchema.safeParse(data).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end via dispatchIntent — readOnly:true compliance intents must
// EXECUTE under PROPOSE_ONLY trust (the trust gate is bypassed for reads).
// ---------------------------------------------------------------------------

describe('compliance-agent / dispatch end-to-end', () => {
  test('dispatchIntent EXECUTES anaf_efactura_health under PROPOSE_ONLY trust (readOnly bypass)', async () => {
    registerComplianceAgentIntents();
    const state = defaultState();
    state.tenant = { id: 't1', settings: {} };
    state.trustLevel = 'PROPOSE_ONLY';
    const result = await dispatchIntent(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockSupabase(state) as any,
      {
        tenantId: 't1',
        channel: 'web',
        intent: 'compliance.anaf_efactura_health',
        payload: {},
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe('EXECUTED');
    }
  });
});
