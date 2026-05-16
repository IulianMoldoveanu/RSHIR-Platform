// HIR F6 — Trust auto-promotion daily worker
//
// Iterates every `tenant_agent_trust` row, joins with
// `v_agent_clean_runs_30d`, and applies the rules from
// `_shared/trust-promote.ts`. Writes an audit row + Telegram OWNER
// notification on every level change. Idempotent.
//
// Auth: shared secret in `X-Cron-Token` header.
//
// Required Edge Function secrets:
//   TRUST_PROMOTE_CRON_TOKEN     shared secret with GitHub Actions cron
//   TELEGRAM_BOT_TOKEN           (optional) bot token for OWNER notifications
// Auto-injected:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Feature flag:
//   TRUST_AUTO_PROMOTE_ENABLED   when 'false', the worker is a no-op
//   (returns ok=true, disabled=true). Default: enabled.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';
import {
  evaluatePromotion,
  formatPromotionNotification,
  formatDemotionNotification,
  type TrustLevel,
} from '../_shared/trust-promote.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type TrustRow = {
  id: string;
  restaurant_id: string;
  agent_name: string;
  action_category: string;
  trust_level: TrustLevel;
  is_destructive: boolean;
  auto_promote_eligible: boolean;
  consecutive_clean_runs: number;
};

type WindowRow = {
  restaurant_id: string;
  agent_name: string;
  clean_runs_30d: number;
  reverts_30d: number;
};

type TenantRow = {
  id: string;
  settings: Record<string, unknown> | null;
};

function readMaxTrustFromSettings(settings: Record<string, unknown> | null): TrustLevel {
  if (!settings || typeof settings !== 'object') return 'AUTO_FULL';
  const ai = (settings as Record<string, unknown>)['ai'];
  if (!ai || typeof ai !== 'object') return 'AUTO_FULL';
  const m = (ai as Record<string, unknown>)['max_trust'];
  if (m === 'PROPOSE_ONLY' || m === 'AUTO_REVERSIBLE' || m === 'AUTO_FULL') return m;
  return 'AUTO_FULL';
}

async function postTelegramOwner(
  token: string,
  chatId: string,
  text: string,
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (e) {
    console.warn('[trust-promote] telegram failed:', (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return json(200, { ok: true, service: 'trust-promote-daily' });
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  return withRunLog('trust-promote-daily', async ({ setMetadata }) => {
    const expected = Deno.env.get('TRUST_PROMOTE_CRON_TOKEN');
    if (!expected) return json(500, { error: 'cron_secret_missing' });
    const got = req.headers.get('x-cron-token') ?? '';
    if (got !== expected) return json(401, { error: 'unauthorized' });

    const enabledRaw = Deno.env.get('TRUST_AUTO_PROMOTE_ENABLED');
    if (enabledRaw && enabledRaw.toLowerCase() === 'false') {
      setMetadata({ disabled: true });
      return json(200, { ok: true, disabled: true });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Load all trust rows + the 30d window aggregates in two queries.
    const { data: trustData, error: trustErr } = await supabase
      .from('tenant_agent_trust')
      .select(
        'id, restaurant_id, agent_name, action_category, trust_level, is_destructive, auto_promote_eligible, consecutive_clean_runs',
      );
    if (trustErr) {
      return json(500, { error: 'trust_fetch_failed', detail: trustErr.message });
    }
    const trustRows = (trustData ?? []) as TrustRow[];

    const { data: windowData, error: windowErr } = await supabase
      .from('v_agent_clean_runs_30d')
      .select('restaurant_id, agent_name, clean_runs_30d, reverts_30d');
    if (windowErr) {
      console.warn('[trust-promote] window view fetch failed:', windowErr.message);
    }
    const windowByKey = new Map<string, WindowRow>();
    for (const w of (windowData ?? []) as WindowRow[]) {
      windowByKey.set(`${w.restaurant_id}|${w.agent_name}`, w);
    }

    // Cache per-tenant settings for max_trust lookup.
    const tenantIds = Array.from(new Set(trustRows.map((r) => r.restaurant_id)));
    const tenantSettings = new Map<string, TenantRow>();
    if (tenantIds.length > 0) {
      const { data: tenantData, error: tenantErr } = await supabase
        .from('tenants')
        .select('id, settings')
        .in('id', tenantIds);
      if (tenantErr) {
        console.warn('[trust-promote] tenants fetch failed:', tenantErr.message);
      }
      for (const t of (tenantData ?? []) as TenantRow[]) {
        tenantSettings.set(t.id, t);
      }
    }

    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const tgChat = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID');

    let promotions = 0;
    let demotions = 0;
    let resets = 0;
    let unchanged = 0;
    let errors = 0;

    for (const row of trustRows) {
      const window = windowByKey.get(`${row.restaurant_id}|${row.agent_name}`) ?? {
        restaurant_id: row.restaurant_id,
        agent_name: row.agent_name,
        clean_runs_30d: 0,
        reverts_30d: 0,
      };
      const maxTrust = readMaxTrustFromSettings(
        tenantSettings.get(row.restaurant_id)?.settings ?? null,
      );

      const decision = evaluatePromotion(
        {
          trustLevel: row.trust_level,
          isDestructive: row.is_destructive,
          autoPromoteEligible: row.auto_promote_eligible,
          consecutiveCleanRuns: row.consecutive_clean_runs,
        },
        {
          cleanRuns30d: window.clean_runs_30d,
          reverts30d: window.reverts_30d,
        },
        maxTrust,
      );

      if (decision.kind === 'no_change') {
        unchanged += 1;
        continue;
      }

      const updates: Record<string, unknown> = {
        consecutive_clean_runs: decision.newConsecutiveCleanRuns,
      };
      if (decision.kind === 'promote' || decision.kind === 'demote') {
        updates.trust_level = decision.to;
        updates.last_auto_promoted_at = new Date().toISOString();
        updates.last_recalibrated_at = new Date().toISOString();
      }
      const { error: updErr } = await supabase
        .from('tenant_agent_trust')
        .update(updates)
        .eq('id', row.id);
      if (updErr) {
        errors += 1;
        console.warn('[trust-promote] update failed:', updErr.message);
        continue;
      }

      if (decision.kind === 'promote' || decision.kind === 'demote') {
        const isPromote = decision.kind === 'promote';
        if (isPromote) promotions += 1;
        else demotions += 1;

        const notif = isPromote
          ? formatPromotionNotification(row.agent_name, row.action_category, decision.to)
          : formatDemotionNotification(
              row.agent_name,
              row.action_category,
              decision.from,
              decision.to,
              window.reverts_30d,
            );

        // Audit row. Write goes through service role so RLS is bypassed.
        await supabase.from('audit_log').insert({
          tenant_id: row.restaurant_id,
          actor_user_id: null,
          action: isPromote
            ? 'ai_ceo.trust_auto_promoted'
            : 'ai_ceo.trust_auto_demoted',
          entity_type: 'tenant_agent_trust',
          entity_id: row.id,
          metadata: {
            agent: row.agent_name,
            category: row.action_category,
            from: decision.from,
            to: decision.to,
            clean_runs_30d: window.clean_runs_30d,
            reverts_30d: window.reverts_30d,
          },
        });

        if (tgToken && tgChat) {
          await postTelegramOwner(tgToken, tgChat, notif);
        }
      } else if (decision.kind === 'reset_counter') {
        resets += 1;
      }
    }

    setMetadata({
      trust_rows: trustRows.length,
      promotions,
      demotions,
      resets,
      unchanged,
      errors,
    });
    return json(200, {
      ok: true,
      trust_rows: trustRows.length,
      promotions,
      demotions,
      resets,
      unchanged,
      errors,
    });
  });
});
