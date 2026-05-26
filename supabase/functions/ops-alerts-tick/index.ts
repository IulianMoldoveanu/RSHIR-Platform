// Wave 3 — Proactive operational alerts.
//
// Polls public.live_ops_telemetry every minute, raises ops_alerts rows for
// real frictions, and pings Iulian via Telegram. Application-side dedupe:
// each (tenant_id, alert_type) only fires once per 30 minutes.
//
// Triggers handled:
//   - dispatched_unpicked_over_5m  ≥ 1  → WARN
//   - kitchen_overdue_over_15m     ≥ 1  → WARN
//
// Env (Supabase function secrets):
//   HIR_NOTIFY_SECRET    shared secret with the pg_cron caller header
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_IULIAN_CHAT_ID
//
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_IULIAN_CHAT_ID = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID') ?? '';
const HIR_NOTIFY_SECRET = Deno.env.get('HIR_NOTIFY_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const DEDUPE_MINUTES = 30;

type TelemetryRow = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  kitchen_queue: number;
  in_courier_flow: number;
  dispatched_unpicked_over_5m: number;
  kitchen_overdue_over_15m: number;
};

type AlertCandidate = {
  tenant_id: string;
  alert_type: string;
  severity: 'WARN' | 'CRIT';
  message: string;
  metadata: Record<string, unknown>;
};

function buildCandidates(rows: TelemetryRow[]): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const r of rows) {
    if (r.dispatched_unpicked_over_5m >= 1) {
      out.push({
        tenant_id: r.tenant_id,
        alert_type: 'dispatched_unpicked_over_5m',
        severity: r.dispatched_unpicked_over_5m >= 3 ? 'CRIT' : 'WARN',
        message:
          `${r.tenant_name}: ${r.dispatched_unpicked_over_5m} comenzi dispatched > 5 min fără curier`,
        metadata: {
          tenant_slug: r.tenant_slug,
          count: r.dispatched_unpicked_over_5m,
        },
      });
    }
    if (r.kitchen_overdue_over_15m >= 1) {
      out.push({
        tenant_id: r.tenant_id,
        alert_type: 'kitchen_overdue_over_15m',
        severity: r.kitchen_overdue_over_15m >= 3 ? 'CRIT' : 'WARN',
        message:
          `${r.tenant_name}: ${r.kitchen_overdue_over_15m} comenzi în bucătărie > 15 min`,
        metadata: {
          tenant_slug: r.tenant_slug,
          count: r.kitchen_overdue_over_15m,
        },
      });
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendTelegram(alert: AlertCandidate): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_IULIAN_CHAT_ID) return;
  const sev = alert.severity === 'CRIT' ? '🔴' : '🟠';
  const text = `${sev} <b>Ops alert</b>\n${escapeHtml(alert.message)}\n<code>${alert.alert_type}</code>`;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_IULIAN_CHAT_ID,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      },
    );
    if (!res.ok) {
      console.error('[ops-alerts-tick] telegram failed', res.status, await res.text());
    }
  } catch (e) {
    console.error('[ops-alerts-tick] telegram threw', (e as Error).message);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  const auth = req.headers.get('x-hir-notify-secret') ?? '';
  if (!HIR_NOTIFY_SECRET || auth !== HIR_NOTIFY_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: rows, error } = await supa
    .from('live_ops_telemetry')
    .select(
      'tenant_id, tenant_name, tenant_slug, kitchen_queue, in_courier_flow, dispatched_unpicked_over_5m, kitchen_overdue_over_15m',
    );
  if (error) {
    return new Response(JSON.stringify({ error: 'telemetry_failed', detail: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const candidates = buildCandidates((rows ?? []) as TelemetryRow[]);
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ ok: true, candidates: 0, fired: 0 }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const dedupeSince = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();
  let fired = 0;
  for (const c of candidates) {
    const { data: dup } = await supa
      .from('ops_alerts')
      .select('id')
      .eq('tenant_id', c.tenant_id)
      .eq('alert_type', c.alert_type)
      .gte('created_at', dedupeSince)
      .limit(1)
      .maybeSingle();
    if (dup) continue;

    const { error: insErr } = await supa.from('ops_alerts').insert({
      tenant_id: c.tenant_id,
      alert_type: c.alert_type,
      severity: c.severity,
      message: c.message,
      metadata: c.metadata,
    });
    if (insErr) {
      console.error('[ops-alerts-tick] insert failed', insErr.message);
      continue;
    }
    fired += 1;
    await sendTelegram(c);
  }

  return new Response(
    JSON.stringify({ ok: true, candidates: candidates.length, fired }),
    { headers: { 'content-type': 'application/json' } },
  );
};

Deno.serve(withRunLog('ops-alerts-tick', handler));
