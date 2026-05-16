// Typed client for `/api/ai/dispatch`. Intended for use in admin-UI client
// components and server actions that want one consistent shape to drive
// any registered Master Orchestrator intent.
//
// Why a wrapper: every call site would otherwise have to remember the
// route URL, the body shape, and the response envelope. Pinning a single
// helper means the route can evolve (e.g. adding tracing headers) without
// every button changing. The `IntentMap` type below mirrors the canonical
// KNOWN_INTENTS list so a typo in `dispatchAgent('mneu.draft_promo', ...)`
// is a TypeScript error, not a runtime 422.

import type { RunState } from './master-orchestrator-types';

// Source of truth: keep in sync with `KNOWN_INTENTS` in
// `_shared/master-orchestrator.ts` + the agent register* helpers (menu,
// marketing, finance, compliance, ops, analytics). Each entry maps the
// intent name to its `payload` shape and `data` shape so the caller gets
// inference at the use site.
export type IntentMap = {
  // ── Analytics (read) ──
  'analytics.summary': {
    payload: { period?: 'today' | 'yesterday' | 'week' | 'month' };
    data: unknown;
  };
  'analytics.top_products': {
    payload: { period?: 'today' | 'yesterday' | 'week' | 'month' };
    data: unknown;
  };
  'analytics.recommendations_today': {
    payload: { days?: number };
    data: unknown;
  };
  'analytics.report': {
    payload: Record<string, never>;
    data: unknown;
  };
  'analytics.explain_anomaly': {
    payload: { metric: 'orders' | 'revenue' | 'aov'; dateRange?: 'today' | 'week' };
    data: unknown;
  };

  // ── Ops (read) ──
  'ops.orders_now': { payload: Record<string, never>; data: unknown };
  'ops.couriers_online': { payload: Record<string, never>; data: unknown };
  'ops.low_stock': { payload: Record<string, never>; data: unknown };
  'ops.weather_today': { payload: { city?: string }; data: unknown };
  'ops.suggest_delivery_zones': { payload: Record<string, never>; data: unknown };
  'ops.optimize_courier_schedule': { payload: Record<string, never>; data: unknown };
  'ops.flag_kitchen_bottlenecks': { payload: Record<string, never>; data: unknown };

  // ── Menu (write) ──
  'menu.description_update': {
    payload: { productId: string; description: string };
    data: unknown;
  };
  'menu.price_change': {
    payload: { productId: string; priceRon: number };
    data: unknown;
  };
  'menu.propose_new_item': {
    payload: { categoryId?: string; name?: string; hint?: string };
    data: unknown;
  };
  'menu.mark_sold_out': {
    payload: { productId: string; minutes?: number };
    data: unknown;
  };
  'menu.draft_promo': {
    payload: { productId?: string; goal?: string };
    data: unknown;
  };

  // ── Marketing (write) ──
  'marketing.draft_post': {
    payload: { topic?: string; channel?: 'facebook' | 'instagram' | 'whatsapp' };
    data: unknown;
  };
  'marketing.publish_post': {
    payload: { postId: string };
    data: unknown;
  };

  // ── Finance (read; OWNER-only) ──
  'finance.cash_flow_30d': { payload: Record<string, never>; data: unknown };
  'finance.tax_summary_month': { payload: { month?: string }; data: unknown };
  'finance.predict_payouts_next_week': { payload: Record<string, never>; data: unknown };

  // ── Compliance (read; OWNER or platform-admin) ──
  'compliance.anaf_efactura_health': { payload: Record<string, never>; data: unknown };
  'compliance.gdpr_data_audit': { payload: Record<string, never>; data: unknown };
  'compliance.legea_95_pharmacy_check': { payload: Record<string, never>; data: unknown };
};

export type IntentName = keyof IntentMap;

export type DispatchClientResult<Intent extends IntentName> =
  | { ok: true; state: 'EXECUTED'; runId: string; data: IntentMap[Intent]['data'] }
  | { ok: true; state: 'PROPOSED'; runId: string; reason: 'trust_level' | 'budget_exhausted'; summary: string }
  | { ok: false; error: string; message?: string; status?: number };

/**
 * Call the admin dispatch route. Throws only on network failures the
 * `fetch` API itself surfaces; HTTP-level errors (401/403/422) are
 * returned as `{ ok: false }` results so the UI can render them inline.
 */
export async function dispatchAgent<Intent extends IntentName>(
  intent: Intent,
  payload: IntentMap[Intent]['payload'],
  init?: { signal?: AbortSignal },
): Promise<DispatchClientResult<Intent>> {
  let res: Response;
  try {
    res = await fetch('/api/ai/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent, payload }),
      signal: init?.signal,
      // Same-origin route; cookies (Supabase session) are sent by default.
    });
  } catch (e) {
    return {
      ok: false,
      error: 'network',
      message: e instanceof Error ? e.message : String(e),
    };
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Empty body — keep envelope-shape error.
  }

  if (!res.ok) {
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : `http_${res.status}`,
      message: typeof body.message === 'string' ? body.message : undefined,
      status: res.status,
    };
  }
  return body as DispatchClientResult<Intent>;
}

// Re-export RunState so call sites narrow on `result.state` without a
// second import.
export type { RunState };
