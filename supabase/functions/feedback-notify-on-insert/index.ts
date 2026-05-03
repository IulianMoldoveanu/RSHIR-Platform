// HIR Restaurant Suite — Feedback Notify on Insert (Phase 1)
//
// Invoked by the AFTER INSERT trigger on public.feedback_reports via pg_net
// (see migration 20260504_001_feedback_intake.sql, function
// notify_feedback_inserted). Posts a Telegram alert to Iulian with:
//   - tenant slug
//   - category
//   - description (first 200 chars)
//   - URL where the issue was reported
//   - signed download link to the screenshot (24h TTL), if any
//
// Env (Supabase function secrets):
//   HIR_NOTIFY_SECRET           shared secret with the DB trigger
//   TELEGRAM_BOT_TOKEN          MasterBOT token from secrets vault
//   TELEGRAM_IULIAN_CHAT_ID     Iulian's personal chat_id
// Auto-injected by the Supabase Edge runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Body = { feedback_id: string; tenant_id: string | null; category: string };

const SCREENSHOT_TTL_SEC = 24 * 60 * 60;
const PREVIEW_CHARS = 200;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) return json(500, { error: 'secret_not_configured' });
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return json(401, { error: 'unauthorized' });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!isUuid(body.feedback_id)) return json(400, { error: 'invalid_body' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const CHAT_ID = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID');
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });
  if (!BOT || !CHAT_ID) return json(500, { error: 'telegram_env_missing' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: report, error: repErr } = await admin
    .from('feedback_reports')
    .select(
      'id, tenant_id, category, description, url, screenshot_path, created_at, ' +
        'tenants:tenant_id ( slug, name )',
    )
    .eq('id', body.feedback_id)
    .maybeSingle();
  if (repErr || !report) {
    console.error('[feedback-notify] lookup failed:', repErr?.message);
    return json(404, { error: 'feedback_not_found' });
  }

  const tenant = (report.tenants ?? null) as { slug: string | null; name: string | null } | null;
  const tenantLabel = tenant?.slug
    ? `${tenant.slug}${tenant.name ? ` (${tenant.name})` : ''}`
    : '(no tenant)';

  // Signed URL for screenshot (24h)
  let screenshotLink: string | null = null;
  if (typeof report.screenshot_path === 'string' && report.screenshot_path.length > 0) {
    const { data: signed, error: signErr } = await admin.storage
      .from('tenant-feedback-screenshots')
      .createSignedUrl(report.screenshot_path, SCREENSHOT_TTL_SEC);
    if (signErr) {
      console.error('[feedback-notify] sign url failed:', signErr.message);
    } else {
      screenshotLink = signed?.signedUrl ?? null;
    }
  }

  const description = String(report.description ?? '');
  const preview =
    description.length > PREVIEW_CHARS
      ? `${description.slice(0, PREVIEW_CHARS)}…`
      : description;

  const lines = [
    `🐛 <b>Feedback nou</b> — <code>${escapeHtml(String(report.category ?? ''))}</code>`,
    `🏪 ${escapeHtml(tenantLabel)}`,
    `📝 ${escapeHtml(preview)}`,
  ];
  if (report.url) lines.push(`🔗 ${escapeHtml(String(report.url))}`);
  if (screenshotLink) lines.push(`🖼 <a href="${escapeHtml(screenshotLink)}">Captură (24h)</a>`);
  lines.push(`#${String(report.id).slice(0, 8)}`);

  const text = lines.join('\n');

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!tgRes.ok) {
    const errText = await tgRes.text();
    console.error('[feedback-notify] telegram failed:', tgRes.status, errText);
    return json(502, { error: 'telegram_failed', status: tgRes.status });
  }

  return json(200, { ok: true, sent: true });
});
