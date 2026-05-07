// Finance Agent — type mirror for the admin app (Sprint 16).
//
// The runtime implementation lives Deno-side at
// `supabase/functions/_shared/finance-agent.ts`. Same architecture as the
// Menu Agent (Sprint 12, PR #354): the admin app holds the SHAPE
// definitions so server actions and any future "Rapoarte Hepy" UI can
// typecheck against the report payload structure without pulling Deno-only
// dependencies into the Next.js bundle.
//
// All three Finance intents are READ-ONLY. They aggregate over existing
// tables (restaurant_orders, psp_payments, courier_orders) and never
// mutate fiscal state, payouts, or PSP records. No ANAF submission.
// No auto-billing. Output is suggestions / reports surfaced to the OWNER.
//
// Drift guard: `finance-agent.test.ts` parses both files at test time and
// asserts the Zod schemas + intent names match. Same pattern as the
// menu-agent / master-orchestrator types/Deno mirror.

import { z } from 'zod';

export const FINANCE_AGENT_MODEL = 'claude-sonnet-4-5-20250929';
export const DAILY_INVOCATION_CAP = 5;

// ---------------------------------------------------------------------------
// Report payload schemas — one per intent
// ---------------------------------------------------------------------------

// finance.cash_flow_30d
export const cashFlowDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD (Bucharest local)
  gross_revenue_ron: z.number().nonnegative(),
  hir_fees_ron: z.number().nonnegative(),
  net_to_restaurant_ron: z.number(),
  courier_payouts_ron: z.number().nonnegative(),
  order_count: z.number().int().nonnegative(),
});

export const cashFlowReportSchema = z.object({
  daily: z.array(cashFlowDaySchema).max(31),
  totals: z.object({
    gross_revenue_ron: z.number().nonnegative(),
    hir_fees_ron: z.number().nonnegative(),
    net_to_restaurant_ron: z.number(),
    courier_payouts_ron: z.number().nonnegative(),
    order_count: z.number().int().nonnegative(),
  }),
  // Heuristic: average daily net / current cash on hand. We don't have
  // a "cash on hand" reading, so this is null when unknown — Hepy
  // narrates "n/a, cash position unknown" rather than guessing.
  runway_days_estimate: z.number().nullable(),
  period_start_iso: z.string().datetime(),
  period_end_iso: z.string().datetime(),
});

// finance.tax_summary_month
export const taxSummaryRowSchema = z.object({
  vat_rate_pct: z.number().int().min(0).max(50),
  gross_ron: z.number().nonnegative(),
  net_ron: z.number().nonnegative(),
  vat_due_ron: z.number().nonnegative(),
  order_count: z.number().int().nonnegative(),
});

export const taxSummaryReportSchema = z.object({
  rows: z.array(taxSummaryRowSchema).max(8), // 6 allowed VAT rates + headroom
  period_start_iso: z.string().datetime(),
  period_end_iso: z.string().datetime(),
  // The rate read from tenants.settings.fiscal.vat_rate_pct at query time.
  // Surfaced so the OWNER sees which rate Hepy applied.
  applied_vat_rate_pct: z.number().int().min(0).max(50),
});

// finance.predict_payouts_next_week
export const predictedPayoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  beneficiary_type: z.enum(['courier', 'fleet']),
  beneficiary_id: z.string().nullable(), // courier auth.uid or fleet uuid; null = aggregate
  amount_estimate_ron: z.number().nonnegative(),
  // 0..1 — based on sample size of the 4-week pattern.
  confidence: z.number().min(0).max(1),
});

export const predictPayoutsReportSchema = z.object({
  predicted_payouts: z.array(predictedPayoutSchema).max(56), // 7d × 8 beneficiaries
  // Number of completed deliveries the prediction was based on.
  basis_sample_size: z.number().int().nonnegative(),
  generated_at_iso: z.string().datetime(),
});

export type CashFlowReport = z.infer<typeof cashFlowReportSchema>;
export type TaxSummaryReport = z.infer<typeof taxSummaryReportSchema>;
export type PredictPayoutsReport = z.infer<typeof predictPayoutsReportSchema>;

// Static intent registration metadata — UI surfaces this list ("ce poate
// face Hepy?") and the test asserts it matches the Deno-side registration.
export const FINANCE_INTENT_NAMES = [
  'finance.cash_flow_30d',
  'finance.tax_summary_month',
  'finance.predict_payouts_next_week',
] as const;

export type FinanceIntentName = (typeof FINANCE_INTENT_NAMES)[number];

// RO labels for the UI.
export const FINANCE_INTENT_LABELS: Record<FinanceIntentName, string> = {
  'finance.cash_flow_30d': 'Flux numerar — ultimele 30 de zile',
  'finance.tax_summary_month': 'Sumar TVA — luna curentă',
  'finance.predict_payouts_next_week': 'Previziune plăți curieri — 7 zile',
};
