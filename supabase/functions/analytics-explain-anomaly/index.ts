// Edge Function: analytics-explain-anomaly
//
// Thin wrapper around `dispatchIntent('analytics.explain_anomaly')` from
// the Master Orchestrator. The admin app's "Explică această cifră" button
// on /dashboard KPI cards calls this function. The dispatcher does the
// trust-gate bypass (read-only), the per-day cap check, the Sonnet call,
// and writes the audit ledger row.
//
// Auth:
//   - Shared secret in `x-hir-notify-secret` (mirrors every other notify-
//     style HIR function). The admin-side route handler enforces the
//     OWNER session check before calling this function.
//   - Body: { tenantId: string, metric: 'orders'|'revenue'|'aov', dateRange?: 'today'|'week' }
//
// Required env:
//   HIR_NOTIFY_SECRET, ANTHROPIC_API_KEY (optional ANTHROPIC_MODEL_SONNET).
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { dispatchIntent } from '../_shared/master-orchestrator.ts';
import { registerAnalyticsIntents } from '../_shared/analytics-intents.ts';

registerAnalyticsIntents();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-hir-notify-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  const got = req.headers.get('x-hir-notify-secret');
  if (!expected || got !== expected) {
    return json(401, { error: 'unauthorized' });
  }

  let body: { tenantId?: string; metric?: string; dateRange?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!body.tenantId || typeof body.tenantId !== 'string') {
    return json(400, { error: 'missing_tenantId' });
  }
  const metric = String(body.metric ?? 'orders').toLowerCase();
  if (metric !== 'orders' && metric !== 'revenue' && metric !== 'aov') {
    return json(400, { error: 'invalid_metric', allowed: ['orders', 'revenue', 'aov'] });
  }
  const dateRange = String(body.dateRange ?? 'today').toLowerCase();
  if (dateRange !== 'today' && dateRange !== 'week') {
    return json(400, { error: 'invalid_dateRange', allowed: ['today', 'week'] });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'supabase_env_missing' });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const result = await dispatchIntent(supabase, {
    tenantId: body.tenantId,
    channel: 'web',
    intent: 'analytics.explain_anomaly',
    payload: { metric, dateRange },
  });

  if (!result.ok) {
    return json(500, { error: result.error, message: result.message });
  }
  if (result.state !== 'EXECUTED') {
    // Read-only intent should always EXECUTE; defensive branch.
    return json(500, { error: 'unexpected_state', state: result.state });
  }
  return json(200, { ok: true, runId: result.runId, ...((result.data as object) ?? {}) });
});
