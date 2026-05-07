// Compliance Agent — type mirror for the admin app (Sprint 17).
//
// The runtime implementation lives Deno-side at
// `supabase/functions/_shared/compliance-agent.ts`. This file mirrors the
// SHAPE definitions so the admin app's server actions and any future
// compliance UI tab can typecheck against the result payload structure
// without pulling Deno-only dependencies into the Next.js bundle.
//
// Drift guard: `compliance-agent.test.ts` imports both files and asserts
// the intent names + result shapes match. Same pattern as menu-agent
// (Sprint 12 PR #354) and master-orchestrator types/Deno mirror.
//
// All three intents are READ-ONLY:
//   compliance.anaf_efactura_health  — read tenants.settings.{fiscal,efactura}
//   compliance.gdpr_data_audit       — scan customers + audit_log + retention
//   compliance.legea_95_pharmacy_check — pharmacy-only Legea 95 reminders
//
// HARD CONSTRAINTS (per lane brief):
//   - NO writes. NO mutations. NO new tables.
//   - NO outbound ANAF SPV API calls (OAuth gate is Iulian-action).
//   - NO triggering GDPR data deletion — IDENTIFY candidates only.
//   - Multi-tenant scoped (tenant_id = ctx.tenantId).
//   - Cost cap ~$0.02/invocation. V0 ships deterministic (no Anthropic
//     call) → effective $0/invocation; AI-generated copy deferred to v1
//     once Iulian approves the recommendation tone.

import { z } from 'zod';

export const COMPLIANCE_AGENT_MODEL = 'claude-sonnet-4-5-20250929';

// ---------------------------------------------------------------------------
// Result payload schemas — one per intent
// ---------------------------------------------------------------------------

export const anafEfacturaHealthResultSchema = z.object({
  cif_present: z.boolean(),
  cif_valid_format: z.boolean(),
  vat_rate_set: z.boolean(),
  vat_rate_pct: z.number().nullable(),
  efactura_enabled: z.boolean(),
  efactura_step_completed: z.number().int().min(0).max(4),
  last_test_status: z.enum(['OK', 'FAILED']).nullable(),
  last_test_age_days: z.number().int().nullable(),
  missing_fields: z.array(z.string()).max(20),
  recommendations: z.array(z.string()).max(10),
});

export const gdprDataAuditResultSchema = z.object({
  stale_customers_count: z.number().int().nonnegative(),
  stale_customers_threshold_days: z.number().int().positive(),
  pii_audit_events_count: z.number().int().nonnegative(),
  pii_audit_events_sample: z
    .array(
      z.object({
        action: z.string(),
        entity_type: z.string().nullable(),
        created_at: z.string(),
      }),
    )
    .max(10),
  retention_policy_set: z.boolean(),
  retention_days: z.number().int().nullable(),
  recommendations: z.array(z.string()).max(10),
});

export const legea95PharmacyCheckResultSchema = z.union([
  z.object({
    applicable: z.literal(false),
    vertical: z.string(),
  }),
  z.object({
    applicable: z.literal(true),
    vertical: z.literal('pharma'),
    pharma_orders_30d: z.number().int().nonnegative(),
    reminders: z.array(z.string()).max(10),
    pharmacist_signoff_field_present: z.boolean(),
  }),
]);

export type AnafEfacturaHealthResult = z.infer<typeof anafEfacturaHealthResultSchema>;
export type GdprDataAuditResult = z.infer<typeof gdprDataAuditResultSchema>;
export type Legea95PharmacyCheckResult = z.infer<typeof legea95PharmacyCheckResultSchema>;

// Static intent registration metadata — UI surfaces this list and the
// test asserts it matches the Deno-side registration.
export const COMPLIANCE_INTENT_NAMES = [
  'compliance.anaf_efactura_health',
  'compliance.gdpr_data_audit',
  'compliance.legea_95_pharmacy_check',
] as const;

export type ComplianceIntentName = (typeof COMPLIANCE_INTENT_NAMES)[number];

// RO labels for the UI.
export const COMPLIANCE_INTENT_LABELS: Record<ComplianceIntentName, string> = {
  'compliance.anaf_efactura_health': 'Sănătate ANAF + e-Factura',
  'compliance.gdpr_data_audit': 'Audit date GDPR',
  'compliance.legea_95_pharmacy_check': 'Verificare Legea 95 (farmacie)',
};

// Threshold for the GDPR stale-customer scan. 365 days = 1 year of
// inactivity is a conservative lower bound — most retention policies
// keep order-related data for the duration of the legal warranty period
// (2 years for consumer goods in RO) but the customer record itself
// (email, phone) can be redacted earlier when there is no active
// transactional relationship.
export const GDPR_STALE_CUSTOMER_DAYS = 365;
