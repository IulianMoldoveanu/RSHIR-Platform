// Menu Agent — type mirror for the admin app (Sprint 12).
//
// The runtime implementation lives Deno-side at
// `supabase/functions/_shared/menu-agent.ts` because the orchestrator
// registry is in the Edge Function runtime; the Telegram channel
// dispatches there. This file mirrors the SHAPE definitions so the admin
// app's server actions and the "Sugestii Hepy" UI tab can typecheck
// against the proposal payload structure without pulling Deno-only
// dependencies into the Next.js bundle.
//
// Drift guard: `menu-agent.test.ts` parses both files at test time and
// asserts the Zod schemas + intent names match. Same pattern as the
// master-orchestrator types/Deno mirror.

import { z } from 'zod';

export const MENU_AGENT_MODEL = 'claude-sonnet-4-5-20250929';
export const DAILY_INVOCATION_CAP = 5;

// ---------------------------------------------------------------------------
// Proposal payload schemas — one per kind
// ---------------------------------------------------------------------------

export const proposeNewItemPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(800),
  price_ron: z.number().nonnegative().max(10000),
  category_hint: z.string().trim().max(120),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
});

export const markSoldOutPayloadSchema = z.object({
  item_id: z.string().uuid(),
  item_name: z.string().trim().min(1).max(200),
  customer_facing_reason: z.string().trim().max(280),
  until_iso: z.string().datetime(),
});

export const draftPromoPayloadSchema = z.object({
  item_id: z.string().uuid(),
  item_name: z.string().trim().min(1).max(200),
  discount_pct: z.number().int().min(1).max(90),
  headline: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(400),
  valid_from: z.string().datetime(),
  valid_to: z.string().datetime(),
});

export type ProposeNewItemPayload = z.infer<typeof proposeNewItemPayloadSchema>;
export type MarkSoldOutPayload = z.infer<typeof markSoldOutPayloadSchema>;
export type DraftPromoPayload = z.infer<typeof draftPromoPayloadSchema>;

export type ProposalKind = 'new_item' | 'sold_out' | 'promo';
export type ProposalStatus = 'DRAFT' | 'ACCEPTED' | 'DISMISSED';

// Discriminated proposal row shape, matches the `menu_agent_proposals`
// table 1:1 (modulo timestamps which the UI passes as strings).
export type MenuAgentProposalRow = {
  id: string;
  tenant_id: string;
  agent_run_id: string | null;
  kind: ProposalKind;
  status: ProposalStatus;
  payload: ProposeNewItemPayload | MarkSoldOutPayload | DraftPromoPayload;
  rationale: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  channel: string;
};

// Static intent registration metadata — UI surfaces this list ("ce poate
// face Hepy?") and the test asserts it matches the Deno-side registration.
export const MENU_INTENT_NAMES = [
  'menu.propose_new_item',
  'menu.mark_sold_out',
  'menu.draft_promo',
] as const;

export type MenuIntentName = (typeof MENU_INTENT_NAMES)[number];

// RO labels for the UI (kind → human label).
export const PROPOSAL_KIND_LABELS: Record<ProposalKind, string> = {
  new_item: 'Produs nou',
  sold_out: 'Marcaj epuizat',
  promo: 'Promoție',
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'În așteptare',
  ACCEPTED: 'Acceptată',
  DISMISSED: 'Respinsă',
};
