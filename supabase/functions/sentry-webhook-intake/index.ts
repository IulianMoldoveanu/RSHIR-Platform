// Edge Function: sentry-webhook-intake
//
// Receives Sentry alert webhooks for the 5 RSHIR projects.
// Authenticates via shared SENTRY_WEBHOOK_SECRET (header `sentry-hook-signature` if
// using a Sentry Internal Integration, OR query param `?token=…` for the simpler
// "Webhook URL" alert action). We accept either; HMAC takes precedence.
//
// Flow:
//   1. Validate auth (HMAC sig OR token query).
//   2. Parse payload, classify severity, derive `app` from project slug.
//   3. Insert row into public.sentry_events (idempotent on dedup_key).
//   4. For severity in (CRITICAL, WARN), dispatch a Telegram message via Hepi bot.
//
// Dry-run: pass `?dry_run=1` to skip Telegram dispatch (still inserts row).
//
// Call shape (live): POST / from Sentry. verify_jwt MUST be false.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, sentry-hook-signature, sentry-hook-resource, sentry-hook-timestamp',
};

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

type Severity = 'INFO' | 'WARN' | 'CRITICAL';

const PROJECT_TO_APP: Record<string, string> = {
  'rshir-customer': 'customer',
  'rshir-vendor': 'vendor',
  'rshir-courier': 'courier',
  'rshir-admin': 'admin',
  'rshir-backend': 'backend',
};

// Patterns we never want to wake Iulian for. These are user-cancellable / network
// transient errors. Sentry can also filter at source; this is a defense-in-depth.
const IGNORED_TITLE_PATTERNS = [
  /AbortError/i,
  /The user aborted a request/i,
  /Failed to fetch/i, // generic network drop on mobile; let it become high-pri only via volume
  /NetworkError when attempting to fetch/i,
  /TypeError: cancelled/i,
  /Load failed/i, // Safari fetch network drop
  /ResizeObserver loop/i,
];

async function verifyHmac(rawBody: string, signatureHex: string | null, secret: string): Promise<boolean> {
  if (!signatureHex) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (hex.length !== signatureHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  return diff === 0;
}

function classifySeverity(payload: any): { severity: Severity; reason: string } {
  // Sentry payload shapes vary by hook source:
  //   issue alerts:    { action: 'created'|'resolved', data: { issue: { ..., level, title, ...} } }
  //   event alerts:    { project_slug, event: {...} }
  //   metric alerts:   { incident: { status, ... }, alert_rule: { ... } }
  //   plain webhook:   { project, project_slug, event, level, message, ... }
  const level: string =
    (payload?.data?.issue?.level as string) ??
    (payload?.event?.level as string) ??
    (payload?.level as string) ??
    'error';

  const action: string = payload?.action ?? '';
  const incidentStatus: string =
    payload?.incident?.status ?? payload?.data?.incident?.status ?? '';
  const title: string =
    payload?.data?.issue?.title ??
    payload?.data?.event?.title ??
    payload?.event?.title ??
    payload?.message ??
    '';

  // Filter: user-cancellable + transient network noise → INFO regardless.
  for (const pat of IGNORED_TITLE_PATTERNS) {
    if (pat.test(title)) return { severity: 'INFO', reason: `filtered:${pat.source}` };
  }

  // Resolved alerts → INFO (still worth logging, never wake Iulian).
  if (action === 'resolved' || incidentStatus === 'closed') {
    return { severity: 'INFO', reason: 'resolved' };
  }

  // Metric alert critical / warning state
  if (incidentStatus === 'critical') return { severity: 'CRITICAL', reason: 'metric:critical' };
  if (incidentStatus === 'warning') return { severity: 'WARN', reason: 'metric:warning' };

  // Issue level → Sentry severities
  switch (level) {
    case 'fatal':
      return { severity: 'CRITICAL', reason: 'level:fatal' };
    case 'error':
      return { severity: 'CRITICAL', reason: 'level:error' };
    case 'warning':
      return { severity: 'WARN', reason: 'level:warning' };
    case 'info':
    case 'debug':
      return { severity: 'INFO', reason: `level:${level}` };
    default:
      return { severity: 'WARN', reason: `level:${level || 'unknown'}` };
  }
}

function deriveApp(payload: any): { app: string; projectSlug: string } {
  const projectSlug: string =
    payload?.project_slug ??
    payload?.data?.event?.project_slug ??
    payload?.data?.issue?.project?.slug ??
    payload?.event?.project ??
    'unknown';
  const app = PROJECT_TO_APP[projectSlug] ?? 'unknown';
  return { app, projectSlug };
}

function buildSummary(payload: any): {
  title: string;
  url: string;
  ruleName: string | null;
  ruleId: string | null;
  issueId: string | null;
  eventId: string | null;
  environment: string | null;
  release: string | null;
  eventCount: number | null;
  userCount: number | null;
} {
  const title: string =
    payload?.data?.issue?.title ??
    payload?.data?.event?.title ??
    payload?.event?.title ??
    payload?.message ??
    payload?.alert_rule?.name ??
    'Sentry alert';
  const url: string =
    payload?.data?.issue?.web_url ??
    payload?.data?.issue?.url ??
    payload?.data?.event?.web_url ??
    payload?.url ??
    payload?.event?.web_url ??
    '';
  const ruleName: string | null =
    payload?.data?.triggered_rule ?? payload?.alert_rule?.name ?? null;
  const ruleId: string | null = payload?.alert_rule?.id?.toString() ?? null;
  const issueId: string | null =
    payload?.data?.issue?.id?.toString() ?? payload?.issue_id?.toString() ?? null;
  const eventId: string | null =
    payload?.data?.event?.event_id ?? payload?.event?.event_id ?? payload?.event_id ?? null;
  const environment: string | null =
    payload?.data?.event?.environment ?? payload?.event?.environment ?? null;
  const release: string | null =
    payload?.data?.event?.release ?? payload?.event?.release ?? null;
  const eventCount: number | null =
    typeof payload?.data?.issue?.count === 'string'
      ? parseInt(payload.data.issue.count, 10)
      : payload?.data?.issue?.count ?? null;
  const userCount: number | null =
    typeof payload?.data?.issue?.userCount === 'string'
      ? parseInt(payload.data.issue.userCount, 10)
      : payload?.data?.issue?.userCount ?? null;
  return { title, url, ruleName, ruleId, issueId, eventId, environment, release, eventCount, userCount };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function dispatchTelegram(
  token: string,
  chatId: string,
  severity: Severity,
  app: string,
  title: string,
  url: string,
  environment: string | null,
  ruleName: string | null,
  eventCount: number | null,
): Promise<void> {
  const emoji = severity === 'CRITICAL' ? '🔴' : severity === 'WARN' ? '⚠️' : 'ℹ️';
  const head = `${emoji} <b>${severity}</b> · Sentry · <b>${escapeHtml(app)}</b>`;
  const titleLine = url
    ? `<a href="${escapeHtml(url)}">${escapeHtml(title.slice(0, 140))}</a>`
    : escapeHtml(title.slice(0, 140));
  const ctxParts: string[] = [];
  if (environment) ctxParts.push(`env: ${environment}`);
  if (ruleName) ctxParts.push(`rule: ${ruleName}`);
  if (eventCount != null) ctxParts.push(`events: ${eventCount}`);
  const ctxLine = ctxParts.length ? `<i>${escapeHtml(ctxParts.join(' · '))}</i>` : '';
  const text = [head, titleLine, ctxLine].filter(Boolean).join('\n');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!r.ok) console.warn('telegram dispatch failed', r.status, await r.text());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const tokenQuery = url.searchParams.get('token');
  const secret = Deno.env.get('SENTRY_WEBHOOK_SECRET');
  if (!secret) {
    console.error('SENTRY_WEBHOOK_SECRET missing');
    return new Response('config error', { status: 500, headers: corsHeaders });
  }

  const rawBody = await req.text();

  // Auth: accept either HMAC header (Sentry Internal Integration) or token query.
  // The token query form is what stock "Webhook URL" alert actions support.
  const sig = req.headers.get('sentry-hook-signature');
  let authed = false;
  if (sig) {
    authed = await verifyHmac(rawBody, sig, secret);
  } else if (tokenQuery) {
    // constant-time-ish compare
    if (tokenQuery.length === secret.length) {
      let diff = 0;
      for (let i = 0; i < tokenQuery.length; i++) diff |= tokenQuery.charCodeAt(i) ^ secret.charCodeAt(i);
      authed = diff === 0;
    }
  }
  if (!authed) {
    return new Response('invalid signature', { status: 401, headers: corsHeaders });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('invalid json', { status: 400, headers: corsHeaders });
  }

  const { app, projectSlug } = deriveApp(payload);
  const { severity, reason } = classifySeverity(payload);
  const meta = buildSummary(payload);

  // dedup_key: collapse retries from Sentry within the same minute on the same
  // (issue, rule) tuple. Falls back to event_id if issue is missing.
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const dedupKey = `${meta.issueId ?? meta.eventId ?? 'noid'}|${meta.ruleId ?? meta.ruleName ?? 'norule'}|${minuteBucket}`;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const summary = `[${reason}] ${meta.title}`.slice(0, 500);

  const { data, error } = await supabase
    .from('sentry_events')
    .insert({
      sentry_issue_id: meta.issueId,
      sentry_event_id: meta.eventId,
      rule_id: meta.ruleId,
      rule_name: meta.ruleName,
      app,
      project_slug: projectSlug,
      environment: meta.environment,
      release: meta.release,
      issue_title: meta.title.slice(0, 500),
      issue_url: meta.url || null,
      issue_level: payload?.data?.issue?.level ?? payload?.event?.level ?? null,
      event_count: meta.eventCount,
      user_count: meta.userCount,
      severity,
      summary,
      raw_payload: payload,
      dedup_key: dedupKey,
      notified_telegram: false,
    })
    .select('id')
    .single();

  if (error && error.code !== '23505') {
    console.error('sentry_events insert error', error);
    return new Response('db error', { status: 500, headers: corsHeaders });
  }
  if (error?.code === '23505') {
    return new Response(JSON.stringify({ ok: true, deduped: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const shouldNotify = (severity === 'CRITICAL' || severity === 'WARN') && !dryRun;
  if (shouldNotify) {
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID');
    if (tgToken && chatId) {
      const dispatch = dispatchTelegram(
        tgToken,
        chatId,
        severity,
        app,
        meta.title,
        meta.url,
        meta.environment,
        meta.ruleName,
        meta.eventCount,
      )
        .then(async () => {
          await supabase.from('sentry_events').update({ notified_telegram: true }).eq('id', data!.id);
        })
        .catch((e) => console.warn('telegram error', e));
      try {
        EdgeRuntime.waitUntil(dispatch);
      } catch {
        dispatch.catch(() => {});
      }
    } else {
      console.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_IULIAN_CHAT_ID not set; skipping notify');
    }
  }

  return new Response(
    JSON.stringify({ ok: true, id: data!.id, severity, app, dry_run: dryRun }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
