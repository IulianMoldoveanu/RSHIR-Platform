// Server-only HTTP bridge from the Node/Next.js admin app to the
// `ai-dispatch` Supabase Edge Function (Deno) which fronts the Master
// Orchestrator `dispatchIntent()`.
//
// Why a bridge: the orchestrator + every sub-agent (menu/marketing/ops/
// finance/compliance) lives in `supabase/functions/_shared/*.ts` and uses
// Deno URL imports — it cannot be imported from Node. Re-implementing the
// dispatcher in Node would duplicate the registry, the trust gate and the
// audit ledger; the bridge keeps one source of truth.
//
// SECURITY: this file uses `HIR_NOTIFY_SECRET` and must NEVER ship in the
// client bundle. Callers (route handlers, server actions) must run on the
// server. The route at `/api/ai/dispatch` is the canonical entry point for
// admin-UI buttons — go through it so the per-agent role gate runs.

import 'server-only';

import type {
  AgentName,
  RunState,
} from './master-orchestrator-types';

export type DispatchEdgeResult =
  | { ok: true; state: 'EXECUTED'; runId: string; data: unknown }
  | { ok: true; state: 'PROPOSED'; runId: string; reason: 'trust_level' | 'budget_exhausted'; summary: string }
  | { ok: false; error: 'unknown_intent' | 'forbidden' | 'invalid_payload' | 'handler_threw'; message: string };

export type DispatchEdgeInput = {
  tenantId: string;
  intent: string;
  payload?: Record<string, unknown>;
  actorUserId?: string | null;
};

export type DispatchBridgeFailure = {
  ok: false;
  error: 'edge_fn_unreachable' | 'edge_fn_failed' | 'server_misconfigured';
  status?: number;
  message?: string;
  body?: unknown;
};

// Re-export channel-side types so callers don't need a second import.
export type { AgentName, RunState };

/**
 * Forward a `dispatchIntent` call to the `ai-dispatch` edge fn. Returns the
 * raw orchestrator result on success, or a `DispatchBridgeFailure` envelope
 * for transport/config errors (network down, missing env, 5xx from the fn).
 *
 * This function does NOT check the user session or the role gate — that's
 * the route handler's job. Calling this directly from anywhere else is a
 * bug (it would bypass the auth boundary).
 */
export async function dispatchViaEdge(
  input: DispatchEdgeInput,
): Promise<DispatchEdgeResult | DispatchBridgeFailure> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const notifySecret = process.env.HIR_NOTIFY_SECRET;
  if (!supabaseUrl || !notifySecret) {
    return {
      ok: false,
      error: 'server_misconfigured',
      message: !supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL missing' : 'HIR_NOTIFY_SECRET missing',
    };
  }

  const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ai-dispatch`;
  let res: Response;
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hir-notify-secret': notifySecret,
      },
      body: JSON.stringify({
        tenantId: input.tenantId,
        intent: input.intent,
        payload: input.payload ?? {},
        actorUserId: input.actorUserId ?? null,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      error: 'edge_fn_unreachable',
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  // Edge fn already shaped success/failure to match DispatchEdgeResult. We
  // only intercept transport-level non-2xx for codes the orchestrator
  // doesn't model (e.g. 500 supabase_env_missing).
  if (!res.ok) {
    // 422 / 400 / 403 carry an orchestrator DispatchResult error — pass it
    // through so the caller sees the dispatcher's verbatim error envelope.
    if (res.status === 422 || res.status === 400 || res.status === 403) {
      return payload as DispatchEdgeResult;
    }
    return {
      ok: false,
      error: 'edge_fn_failed',
      status: res.status,
      body: payload,
    };
  }

  return payload as DispatchEdgeResult;
}
