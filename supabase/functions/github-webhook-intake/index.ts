// Edge Function: github-webhook-intake
//
// Receives GitHub webhook events for IulianMoldoveanu/RSHIR-Platform.
// Validates X-Hub-Signature-256 against GITHUB_WEBHOOK_SECRET.
// Inserts a row into public.github_pr_events (idempotent by X-GitHub-Delivery).
// Sends a Telegram alert via Hepi bot for severity in (CRITICAL, WARN)
// when TELEGRAM_IULIAN_CHAT_ID is set; otherwise logs and proceeds.
//
// Call shape (live): POST / from GitHub. verify_jwt MUST be false.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-hub-signature-256, x-github-event, x-github-delivery',
};

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

type Severity = 'INFO' | 'WARN' | 'CRITICAL';

async function verifyHmac(rawBody: string, signature256: string | null, secret: string): Promise<boolean> {
  if (!signature256 || !signature256.startsWith('sha256=')) return false;
  const expected = signature256.slice(7);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  // constant-time compare
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function classify(eventType: string, payload: any): { severity: Severity; summary: string; prNumber: number | null; prTitle: string | null; prHeadSha: string | null; actor: string | null } {
  const actor = payload?.sender?.login ?? null;
  const pr = payload?.pull_request ?? payload?.issue?.pull_request ? payload?.issue ?? payload?.pull_request : null;
  const prNumber = payload?.pull_request?.number ?? payload?.issue?.number ?? payload?.check_run?.pull_requests?.[0]?.number ?? payload?.workflow_run?.pull_requests?.[0]?.number ?? null;
  const prTitle = payload?.pull_request?.title ?? payload?.issue?.title ?? null;
  const prHeadSha = payload?.pull_request?.head?.sha ?? payload?.check_run?.head_sha ?? payload?.workflow_run?.head_sha ?? null;

  if (eventType === 'check_run' && payload?.action === 'completed') {
    const concl = payload?.check_run?.conclusion;
    const name = payload?.check_run?.name ?? 'check';
    if (['failure', 'cancelled', 'timed_out'].includes(concl)) {
      const errLine = payload?.check_run?.output?.summary?.split('\n')?.find((l: string) => /error|fail/i.test(l))?.slice(0, 200) ?? '';
      return { severity: 'CRITICAL', summary: `${name}: ${concl}${errLine ? ` — ${errLine}` : ''}`.slice(0, 300), prNumber, prTitle, prHeadSha, actor };
    }
    return { severity: 'INFO', summary: `${name}: ${concl ?? 'unknown'}`.slice(0, 300), prNumber, prTitle, prHeadSha, actor };
  }

  if (eventType === 'pull_request_review' && payload?.action === 'submitted') {
    const state = payload?.review?.state;
    const body = (payload?.review?.body ?? '').slice(0, 200);
    if (state === 'changes_requested') {
      return { severity: 'CRITICAL', summary: `Review CHANGES_REQUESTED by ${actor}: ${body}`.slice(0, 300), prNumber, prTitle, prHeadSha, actor };
    }
    if (state === 'commented' || state === 'approved') {
      return { severity: 'INFO', summary: `Review ${state} by ${actor}: ${body}`.slice(0, 300), prNumber, prTitle, prHeadSha, actor };
    }
  }

  if (eventType === 'issue_comment' && payload?.action === 'created' && payload?.issue?.pull_request) {
    const body = (payload?.comment?.body ?? '').slice(0, 200);
    const isBot = (payload?.comment?.user?.type === 'Bot') || /bot/i.test(actor ?? '');
    return { severity: isBot ? 'WARN' : 'INFO', summary: `Comment by ${actor}: ${body}`.slice(0, 300), prNumber, prTitle, prHeadSha, actor };
  }

  if (eventType === 'pull_request') {
    const action = payload?.action ?? 'unknown';
    const merged = payload?.pull_request?.merged === true;
    if (action === 'closed' && merged) {
      return { severity: 'INFO', summary: `PR merged by ${actor}: ${prTitle}`.slice(0, 300), prNumber, prTitle, prHeadSha, actor };
    }
    if (['opened', 'reopened', 'closed'].includes(action)) {
      return { severity: 'INFO', summary: `PR ${action} by ${actor}: ${prTitle}`.slice(0, 300), prNumber, prTitle, prHeadSha, actor };
    }
  }

  if (eventType === 'workflow_run' && payload?.action === 'completed') {
    const concl = payload?.workflow_run?.conclusion;
    const name = payload?.workflow_run?.name ?? 'workflow';
    if (concl === 'failure') {
      return { severity: 'CRITICAL', summary: `Workflow ${name}: failure`.slice(0, 300), prNumber, prTitle, prHeadSha, actor };
    }
    return { severity: 'INFO', summary: `Workflow ${name}: ${concl}`.slice(0, 300), prNumber, prTitle, prHeadSha, actor };
  }

  return { severity: 'INFO', summary: `${eventType}: noop`, prNumber, prTitle, prHeadSha, actor };
}

async function dispatchTelegram(token: string, chatId: string, severity: Severity, repo: string, prNumber: number | null, summary: string): Promise<void> {
  const emoji = severity === 'CRITICAL' ? '🔴' : severity === 'WARN' ? '⚠️' : 'ℹ️';
  const prRef = prNumber ? `PR #${prNumber}` : '';
  const url = prNumber ? `https://github.com/${repo}/pull/${prNumber}` : `https://github.com/${repo}`;
  const text = `${emoji} ${severity} — ${repo} ${prRef}\n${summary}\n${url}`;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!r.ok) console.warn('telegram dispatch failed', r.status, await r.text());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: corsHeaders });

  const secret = Deno.env.get('GITHUB_WEBHOOK_SECRET');
  if (!secret) {
    console.error('GITHUB_WEBHOOK_SECRET missing');
    return new Response('config error', { status: 500, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  if (!(await verifyHmac(rawBody, sig, secret))) {
    return new Response('invalid signature', { status: 401, headers: corsHeaders });
  }

  const eventType = req.headers.get('x-github-event') ?? 'unknown';
  const deliveryId = req.headers.get('x-github-delivery') ?? `local-${Date.now()}`;

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return new Response('invalid json', { status: 400, headers: corsHeaders }); }

  const repo = payload?.repository?.full_name ?? 'unknown/unknown';
  const { severity, summary, prNumber, prTitle, prHeadSha, actor } = classify(eventType, payload);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase
    .from('github_pr_events')
    .insert({
      event_type: eventType,
      repo,
      pr_number: prNumber,
      pr_title: prTitle,
      pr_head_sha: prHeadSha,
      actor,
      severity,
      summary,
      raw_payload: payload,
      delivery_id: deliveryId,
      notified_telegram: false,
    })
    .select('id')
    .single();

  // Idempotent: duplicate delivery returns 23505 unique violation — drop silently.
  if (error && error.code !== '23505') {
    console.error('insert error', error);
    return new Response('db error', { status: 500, headers: corsHeaders });
  }
  if (error?.code === '23505') {
    return new Response(JSON.stringify({ ok: true, deduped: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (severity === 'CRITICAL' || severity === 'WARN') {
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID');
    if (tgToken && chatId) {
      const dispatch = dispatchTelegram(tgToken, chatId, severity, repo, prNumber, summary)
        .then(async () => {
          await supabase.from('github_pr_events').update({ notified_telegram: true }).eq('id', data!.id);
        })
        .catch(e => console.warn('telegram error', e));
      try { EdgeRuntime.waitUntil(dispatch); } catch { dispatch.catch(() => {}); }
    } else {
      console.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_IULIAN_CHAT_ID not set; skipping notify');
    }
  }

  return new Response(JSON.stringify({ ok: true, id: data!.id, severity }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
