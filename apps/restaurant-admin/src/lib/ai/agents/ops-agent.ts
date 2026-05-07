// Ops Agent — type mirror for the admin app (Sprint 14).
//
// The runtime implementation lives Deno-side at
// `supabase/functions/_shared/ops-agent.ts`. This file mirrors the SHAPE
// definitions so the admin app's server actions and any "Sugestii Ops"
// UI tab can typecheck against the result payload structure without
// pulling Deno-only dependencies into the Next.js bundle.
//
// Drift guard: `ops-agent.test.ts` parses both files at test time and
// asserts the Zod schemas + intent names match. Same pattern as the
// Menu Agent (Sprint 12, PR #354).
//
// All 3 ops intents are READ-ONLY suggestions: they query the tenant's
// own data + ask Sonnet to interpret it, then return a structured
// payload to the caller. They do NOT write proposal rows or mutate
// state — the OWNER reads the suggestion in the channel they invoked
// from (Telegram, dashboard widget) and acts manually via existing UIs
// (delivery-zones page, fleet-managers page, menu page).

import { z } from 'zod';

export const OPS_AGENT_MODEL = 'claude-sonnet-4-5-20250929';
export const DAILY_INVOCATION_CAP = 10;

// ---------------------------------------------------------------------------
// Result payload schemas — one per intent
// ---------------------------------------------------------------------------

// Intent 1: ops.suggest_delivery_zones
export const proposedZoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // One of polygon (GeoJSON Polygon coords) OR radius_km + center.
  polygon: z
    .object({
      type: z.literal('Polygon'),
      coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
    })
    .nullable()
    .optional(),
  radius_km: z.number().positive().max(50).nullable().optional(),
  center: z
    .object({ lat: z.number(), lng: z.number() })
    .nullable()
    .optional(),
  justification: z.string().trim().min(1).max(400),
  est_orders_per_day: z.number().nonnegative().max(10000),
});

export const suggestDeliveryZonesResultSchema = z.object({
  proposed_zones: z.array(proposedZoneSchema).max(3),
  notes: z.string().trim().max(600).default(''),
});

// Intent 2: ops.optimize_courier_schedule
// One row per (day_of_week, hour). gap = recommended - current_avg.
export const scheduleSlotSchema = z.object({
  day_of_week: z.number().int().min(0).max(6), // 0=Sunday … 6=Saturday (Postgres dow)
  hour: z.number().int().min(0).max(23),
  recommended_couriers: z.number().int().nonnegative().max(50),
  current_avg: z.number().nonnegative().max(50),
  gap: z.number(), // can be negative (over-staffed)
});

export const optimizeCourierScheduleResultSchema = z.object({
  schedule: z.array(scheduleSlotSchema).max(168),
  summary: z.string().trim().max(600).default(''),
});

// Intent 3: ops.flag_kitchen_bottlenecks
// avg_prep_min and p95_prep_min are derived from the
// `restaurant_orders.updated_at - created_at` span on DELIVERED rows
// containing the item — this is an end-to-end fulfillment proxy, NOT a
// pure prep time. The proxy is documented in the Deno handler.
export const bottleneckRowSchema = z.object({
  menu_item_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  avg_prep_min: z.number().nonnegative().max(600),
  target_prep_min: z.number().nonnegative().max(600),
  p95_prep_min: z.number().nonnegative().max(600),
  suggestion: z.string().trim().min(1).max(400),
});

export const flagKitchenBottlenecksResultSchema = z.object({
  bottlenecks: z.array(bottleneckRowSchema).max(10),
  notes: z.string().trim().max(600).default(''),
});

export type ProposedZone = z.infer<typeof proposedZoneSchema>;
export type SuggestDeliveryZonesResult = z.infer<typeof suggestDeliveryZonesResultSchema>;
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;
export type OptimizeCourierScheduleResult = z.infer<typeof optimizeCourierScheduleResultSchema>;
export type BottleneckRow = z.infer<typeof bottleneckRowSchema>;
export type FlagKitchenBottlenecksResult = z.infer<typeof flagKitchenBottlenecksResultSchema>;

// Static intent registration metadata — UI surfaces this list ("ce poate
// face Hepy?") and the test asserts it matches the Deno-side registration.
export const OPS_INTENT_NAMES = [
  'ops.suggest_delivery_zones',
  'ops.optimize_courier_schedule',
  'ops.flag_kitchen_bottlenecks',
] as const;

export type OpsIntentName = (typeof OPS_INTENT_NAMES)[number];

// RO labels for the UI.
export const OPS_INTENT_LABELS: Record<OpsIntentName, string> = {
  'ops.suggest_delivery_zones': 'Sugerează zone de livrare noi',
  'ops.optimize_courier_schedule': 'Optimizează programul curierilor',
  'ops.flag_kitchen_bottlenecks': 'Identifică blocaje în bucătărie',
};
