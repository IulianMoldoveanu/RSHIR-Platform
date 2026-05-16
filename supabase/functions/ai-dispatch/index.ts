// Edge Function: ai-dispatch
//
// Generic HTTP bridge in front of the Master Orchestrator `dispatchIntent()`.
// The admin web app's `/api/ai/dispatch` route handler forwards calls here
// after authenticating the OWNER/STAFF session and checking the per-agent
// role gate. Telegram has had this surface since Sprint 13; this edge fn
// gives the web channel parity so any admin-UI button can drive any
// registered intent (menu/marketing/ops/finance/compliance/cs/analytics)
// without each surface re-implementing the dispatcher contract.
//
// Auth:
//   - Shared secret in `x-hir-notify-secret` (same pattern as
//     analytics-explain-anomaly + notify-customer-status). The web route
//     enforces the user session + role gate BEFORE calling this fn.
//   - Body: { tenantId: string, intent: string, payload?: object }
//
// Required env:
//   HIR_NOTIFY_SECRET. Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { dispatchIntent } from '../_shared/master-orchestrator.ts';
import { registerAnalyticsIntents } from '../_shared/analytics-intents.ts';
import { registerOpsAgentIntents } from '../_shared/ops-agent.ts';
import { registerMenuAgentIntents } from '../_shared/menu-agent.ts';
import { registerMarketingAgent } from '../_shared/marketing-agent.ts';
import { registerFinanceAgentIntents } from '../_shared/finance-agent.ts';
import { registerComplianceAgentIntents } from '../_shared/compliance-agent.ts';
import { registerCsIntents } from '../_shared/cs-agent.ts';
import { registerGrowthIntents } from '../_shared/growth-agent.ts';
import { registerMasterIntents } from '../_shared/master-agent.ts';

// Register every shipped agent so the dispatcher has the full intent map
// resident in this edge fn. registerIntent() is idempotent (warns on
// duplicate), so re-imports across cold starts are safe.
registerAnalyticsIntents();
registerOpsAgentIntents();
registerMenuAgentIntents();
registerMarketingAgent();
registerFinanceAgentIntents();
registerComplianceAgentIntents();
registerCsIntents();
registerGrowthIntents();
registerMasterIntents();

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

  let body: { tenantId?: string; intent?: string; payload?: unknown; actorUserId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!body.tenantId || typeof body.tenantId !== 'string') {
    return json(400, { error: 'missing_tenantId' });
  }
  if (!body.intent || typeof body.intent !== 'string') {
    return json(400, { error: 'missing_intent' });
  }
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};

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
    intent: body.intent,
    payload,
    actorUserId: body.actorUserId ?? null,
  });

  // Map dispatcher errors to HTTP codes. The web route mirrors this so UI
  // code can distinguish "you typed the wrong intent name" from "the
  // handler blew up".
  if (!result.ok) {
    if (result.error === 'unknown_intent') return json(422, result);
    if (result.error === 'invalid_payload') return json(400, result);
    if (result.error === 'forbidden') return json(403, result);
    return json(500, result);
  }
  return json(200, result);
});
