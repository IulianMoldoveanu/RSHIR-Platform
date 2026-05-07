// HIR Marketing Agent — single-call entrypoint (Sprint 14)
//
// POST /functions/v1/marketing-agent-draft
//   Headers:  X-Cron-Token: <GROWTH_CRON_TOKEN>     (operator-side trigger)
//             OR a service-role bearer with edge-function caller perms
//   Body:     { tenant_id: uuid, brief_ro?: string, platform?: string,
//               post_type?: string }
//
// Dispatches `marketing.draft_post` through the Master Orchestrator (PR
// #341). The dispatcher consults `tenant_agent_trust` for
// (marketing, social.draft); if PROPOSE_ONLY, the draft is NOT generated
// and a PROPOSED ledger row is written instead. If AUTO_REVERSIBLE or
// AUTO_FULL, Sonnet 4.5 is called and a row lands in `marketing_drafts`.
//
// Reuses GROWTH_CRON_TOKEN to keep the secret surface flat (one shared
// secret across `growth-agent-daily` + `marketing-agent-draft`). If we
// later need per-agent rate-limit isolation we can split.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';
import { dispatchIntent } from '../_shared/master-orchestrator.ts';
import { registerMarketingAgent } from '../_shared/marketing-agent.ts';

// Register on cold start. Idempotent.
registerMarketingAgent();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return json(200, { ok: true, service: 'marketing-agent-draft' });
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  return withRunLog('marketing-agent-draft', async ({ setMetadata }) => {
    const expected = Deno.env.get('GROWTH_CRON_TOKEN');
    if (!expected) return json(500, { error: 'cron_secret_missing' });
    const got = req.headers.get('x-cron-token') ?? '';
    if (got !== expected) return json(401, { error: 'unauthorized' });

    let body: { tenant_id?: string; brief_ro?: string; platform?: string; post_type?: string } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }
    const tenantId = body.tenant_id;
    if (!tenantId || typeof tenantId !== 'string') {
      return json(400, { error: 'missing_tenant_id' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await dispatchIntent(supabase, {
      tenantId,
      channel: 'web',
      intent: 'marketing.draft_post',
      payload: {
        brief_ro: body.brief_ro ?? undefined,
        platform: body.platform ?? undefined,
        post_type: body.post_type ?? undefined,
      },
    });

    setMetadata({
      tenant_id: tenantId,
      result_state: result.ok ? result.state : 'ERROR',
    });

    if (!result.ok) {
      return json(400, { ok: false, error: result.error, message: result.message });
    }
    return json(200, result);
  });
});
