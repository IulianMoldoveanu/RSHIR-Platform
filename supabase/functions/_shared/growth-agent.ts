// HIR Growth Agent — Deno-side canonical runtime (RSHIR F6 closure).
//
// Registered with the Master Orchestrator as the GROWTH sub-agent. Until
// this file landed, growth surface was daily-cron-only (see
// `supabase/functions/growth-agent-daily/index.ts`) with no on-demand
// dispatch path — the orchestrator could not surface growth state to
// other channels (web admin, telegram bot, voice). This module fills
// that gap with two read intents over the existing
// `public.growth_recommendations` table; no write intents because the
// daily cron is the canonical producer.
//
// Intents:
//   growth.recommendations_for_tenant — paginated list of recent
//                                        recommendations (status filter)
//   growth.recommendation_get         — single recommendation by id
//
// Both are read-only, so the dispatcher bypasses the trust gate.
//
// Pattern mirror: `_shared/cs-agent.ts` registration shape. No Anthropic
// call here — growth analytics already cost money via the daily cron; the
// on-demand surface is a pure DB read.

import {
  registerIntent,
  type HandlerContext,
  type HandlerPlan,
  type HandlerResult,
  type IntentHandler,
} from './master-orchestrator.ts';

// ---------------------------------------------------------------------------
// Payload validators
// ---------------------------------------------------------------------------

const RECOMMENDATION_STATUSES = [
  'pending',
  'approved',
  'dismissed',
  'applied',
  'expired',
] as const;
type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

function isUuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function asStatusFilter(v: unknown): RecommendationStatus | null {
  if (typeof v !== 'string') return null;
  return (RECOMMENDATION_STATUSES as readonly string[]).includes(v)
    ? (v as RecommendationStatus)
    : null;
}

function asLimit(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(50, Math.floor(n));
}

// ---------------------------------------------------------------------------
// Intent 1 — growth.recommendations_for_tenant (read)
// ---------------------------------------------------------------------------

// Payload: { status?: RecommendationStatus, limit?: number }
const recommendationsForTenantHandler: IntentHandler = {
  plan: async (ctx, payload) => {
    const status = asStatusFilter((payload as Record<string, unknown>).status);
    const limit = asLimit((payload as Record<string, unknown>).limit);
    return {
      actionCategory: 'growth.read',
      summary: status
        ? `List ${limit} growth recommendations (status=${status}) for tenant`
        : `List ${limit} growth recommendations for tenant`,
      resolvedPayload: { status, limit },
    } satisfies HandlerPlan;
  },
  execute: async (ctx, plan) => {
    const { status, limit } = (plan.resolvedPayload ?? {}) as {
      status: RecommendationStatus | null;
      limit: number;
    };
    let q = ctx.supabase
      .from('growth_recommendations')
      .select(
        'id, generated_at, category, priority, title_ro, suggested_action_ro, status, decided_at',
      )
      .eq('tenant_id', ctx.tenantId)
      .order('generated_at', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) {
      throw new Error(`growth_read_failed: ${error.message}`);
    }
    return {
      summary: `Returned ${(data ?? []).length} growth recommendation(s).`,
      data: { recommendations: data ?? [] },
    } satisfies HandlerResult;
  },
};

// ---------------------------------------------------------------------------
// Intent 2 — growth.recommendation_get (read)
// ---------------------------------------------------------------------------

// Payload: { id: uuid }
const recommendationGetHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const id = (payload as Record<string, unknown>).id;
    if (!isUuid(id)) throw new Error('invalid_payload: id must be uuid');
    return {
      actionCategory: 'growth.read',
      summary: 'Fetch single growth recommendation.',
      resolvedPayload: { id },
    } satisfies HandlerPlan;
  },
  execute: async (ctx, plan) => {
    const { id } = plan.resolvedPayload as { id: string };
    const { data, error } = await ctx.supabase
      .from('growth_recommendations')
      .select(
        'id, generated_at, category, priority, title_ro, rationale_ro, suggested_action_ro, payload, auto_action_available, status, decided_at, decided_by',
      )
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (error) {
      throw new Error(`growth_read_failed: ${error.message}`);
    }
    if (!data) {
      return {
        summary: 'Recommendation not found.',
        data: { recommendation: null },
      } satisfies HandlerResult;
    }
    return {
      summary: `Recommendation ${id} (status=${data.status}).`,
      data: { recommendation: data },
    } satisfies HandlerResult;
  },
};

// ---------------------------------------------------------------------------
// Registration — idempotent
// ---------------------------------------------------------------------------

let registered = false;

export function registerGrowthIntents(): void {
  if (registered) return;
  registered = true;

  registerIntent({
    name: 'growth.recommendations_for_tenant',
    agent: 'growth',
    defaultCategory: 'growth.read',
    description: 'Listează recomandările de creștere generate de daily cron.',
    readOnly: true,
    handler: recommendationsForTenantHandler,
  });

  registerIntent({
    name: 'growth.recommendation_get',
    agent: 'growth',
    defaultCategory: 'growth.read',
    description: 'Detalii pentru o singură recomandare de creștere (cu rationale + payload).',
    readOnly: true,
    handler: recommendationGetHandler,
  });
}

export function __resetGrowthRegisteredForTesting(): void {
  registered = false;
}
