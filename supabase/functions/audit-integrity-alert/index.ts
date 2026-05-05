// Edge Function: audit-integrity-alert
//
// Posts a Telegram message to Iulian when the audit_log hash chain shows a
// mismatch. ONLY destination is Telegram — does NOT write to feedback_reports
// (per Lane S design: feedback_reports is for user-submitted feedback, not
// internal infra alerts).
//
// Invocation contract (POST JSON):
//   {
//     "row_id":         "uuid",        // required
//     "expected_hash":  "hex64",       // required
//     "stored_hash":    "hex64",       // required
//     "verifier_run_id": "uuid"|null,  // optional, for cross-reference
//     "range_start":    "iso"|null,
//     "range_end":      "iso"|null
//   }
//
// Auth: shared bearer token in env AUDIT_INTEGRITY_ALERT_TOKEN.
// verify_jwt MUST be false in supabase/config.toml when this fn is deployed,
// because the caller is the verifier API route (server-side, not user JWT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

type Body = {
  row_id: string;
  expected_hash: string;
  stored_hash: string;
  verifier_run_id?: string | null;
  range_start?: string | null;
  range_end?: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // --- Auth ---
  const expected = Deno.env.get('AUDIT_INTEGRITY_ALERT_TOKEN');
  if (!expected) return json({ error: 'token_not_configured' }, 500);
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (token !== expected) return json({ error: 'unauthorized' }, 401);

  // --- Parse ---
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body.row_id || !body.expected_hash || !body.stored_hash) {
    return json({ error: 'missing_fields' }, 400);
  }

  // --- Telegram dispatch ---
  const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_OPERATOR_CHAT_ID');
  if (!tgToken || !chatId) {
    return json({ error: 'telegram_not_configured' }, 500);
  }

  const text =
    `[AUDIT INTEGRITY] mismatch detected\n` +
    `row id=${body.row_id}\n` +
    `expected=${body.expected_hash.slice(0, 16)}…\n` +
    `actual=${body.stored_hash.slice(0, 16)}…\n` +
    (body.range_start ? `range_start=${body.range_start}\n` : '') +
    (body.range_end ? `range_end=${body.range_end}\n` : '') +
    (body.verifier_run_id ? `run_id=${body.verifier_run_id}` : '');

  const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });

  if (!tgRes.ok) {
    const errText = await tgRes.text().catch(() => '');
    console.error('[audit-integrity-alert] telegram failed', tgRes.status, errText);
    return json({ error: 'telegram_failed', status: tgRes.status }, 502);
  }

  return json({ ok: true });
});
