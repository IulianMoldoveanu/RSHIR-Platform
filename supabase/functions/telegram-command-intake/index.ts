// Edge Function: telegram-command-intake
//
// Inbound webhook from Telegram for Hepi bot. Iulian DMs the bot — we receive,
// authenticate by chat_id whitelist, parse slash command, execute, reply.
//
// Commands:
//   /status            — last 24h CRITICAL+WARN events summary
//   /feedback          — last 5 feedback reports
//   /pr <n>            — PR details + checks + reviews
//   /merge <n>         — squash-merge with /confirm gate
//   /deploy <app>      — trigger Vercel redeploy
//   /ask <text>        — Anthropic Claude direct
//   /fix <feedback_id> — manually trigger Fix Agent (writes triage_routed_to_fix=true)
//   /confirm <code>    — confirm a pending destructive action
//   /help              — list commands
//
// Inline-button callbacks (callback_query):
//   fix:feedback:<id>     — route to Fix Agent
//   manual:feedback:<id>  — mark needs human review
//   approve:fix:<id>      — squash-merge the auto-fix PR
//   reject:fix:<id>       — close the auto-fix PR

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_CHAT_ID = 1274150118; // Iulian
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tgSend(token: string, chatId: number, text: string, replyTo?: number, inlineKeyboard?: any[][]): Promise<number | null> {
  const body: any = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (replyTo) body.reply_to_message_id = replyTo;
  if (inlineKeyboard) body.reply_markup = { inline_keyboard: inlineKeyboard };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) { console.warn('tg send fail', r.status, await r.text()); return null; }
  const j = await r.json();
  return j?.result?.message_id ?? null;
}

async function tgAnswerCallback(token: string, callbackId: string, text?: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text: text ?? '✓' }),
  }).catch(e => console.warn('answerCallback fail', e));
}

async function ghApi(path: string, token: string, opts: RequestInit = {}): Promise<any> {
  const r = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', ...(opts.headers || {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function vercelApi(path: string, token: string, opts: RequestInit = {}): Promise<any> {
  const r = await fetch(`https://api.vercel.com${path}`, {
    ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function genConfirmCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

const VERCEL_PROJECTS: Record<string, string> = {
  admin: 'prj_AVs9s3VEoC8GR3Kz0krHDpCJKj4k',     // hir-restaurant-admin
  web: 'prj_HKK2JtiMLXuwpwYq35qy020pHVl6',       // hir-restaurant-web
  courier: 'prj_SoeRSjJX8t8nTF8EGgzjDl7ujE2G',   // hir-pharma-courier (memorial; serves apps/restaurant-courier)
};

const REPO = 'IulianMoldoveanu/RSHIR-Platform';

async function logCommand(supabase: any, row: any): Promise<void> {
  await supabase.from('command_log').insert(row).catch((e: any) => console.warn('log fail', e));
}

async function handleCommand(
  supabase: any, ghToken: string, vercelToken: string, anthropicKey: string,
  cmd: string, args: string, chatId: number
): Promise<{ text: string; keyboard?: any[][]; status: string }> {
  if (cmd === '/help' || cmd === '/start') {
    return {
      text: `<b>🤖 Hepi commands</b>
/status — ce s-a întâmplat în ultimele 24h
/feedback — ultimele 5 bug reports de la patroni
/pr &lt;n&gt; — detalii PR + checks + reviews
/merge &lt;n&gt; — squash-merge (cere /confirm)
/deploy &lt;admin|web|courier&gt; — redeploy prod (cere /confirm)
/ask &lt;întrebare&gt; — întreabă AI direct (Claude)
/fix &lt;feedback_id&gt; — pornește Fix Agent manual
/confirm &lt;cod&gt; — confirmă o acțiune destructivă pendintă
/audit — ultimele 10 comenzi rulate`,
      status: 'OK',
    };
  }

  if (cmd === '/status') {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: events } = await supabase
      .from('github_pr_events')
      .select('severity,event_type,summary,actor,pr_number,repo,created_at')
      .gte('created_at', since)
      .in('severity', ['CRITICAL', 'WARN'])
      .not('event_type', 'like', '%.backfill')
      .order('created_at', { ascending: false })
      .limit(15);
    const { data: fb } = await supabase
      .from('feedback_reports')
      .select('id,category,severity,description,status,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);
    const lines: string[] = [`<b>📊 Status 24h</b>`];
    if (events && events.length) {
      lines.push(`\n<b>GitHub events (${events.length}):</b>`);
      for (const e of events.slice(0, 8)) {
        const t = new Date(e.created_at).toISOString().substring(11, 16);
        const emoji = e.severity === 'CRITICAL' ? '🔴' : '⚠️';
        const prRef = e.pr_number ? `PR #${e.pr_number}` : e.repo;
        lines.push(`${emoji} <code>${t}</code> ${escapeHtml(prRef)} — ${escapeHtml((e.summary || '').slice(0, 80))}`);
      }
      if (events.length > 8) lines.push(`…și încă ${events.length - 8}`);
    } else lines.push('\nNiciun event WARN/CRITICAL. 🟢');
    if (fb && fb.length) {
      lines.push(`\n<b>Feedback reports (${fb.length}):</b>`);
      for (const f of fb) {
        lines.push(`🐛 <code>${f.id.slice(0, 8)}</code> ${escapeHtml(f.category)} — ${escapeHtml((f.description || '').slice(0, 80))} · <i>${f.status}</i>`);
      }
    } else lines.push('\nNiciun feedback nou. 🟢');
    return { text: lines.join('\n').slice(0, 4000), status: 'OK' };
  }

  if (cmd === '/feedback') {
    const { data: fb } = await supabase
      .from('feedback_reports')
      .select('id,tenant_id,category,severity,description,status,url,created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (!fb || fb.length === 0) return { text: '🟢 Niciun feedback raportat încă.', status: 'OK' };
    const lines = ['<b>🐛 Ultimele 5 feedback reports</b>'];
    for (const f of fb) {
      const t = new Date(f.created_at).toISOString().substring(0, 16).replace('T', ' ');
      lines.push(`\n<code>${f.id.slice(0, 8)}</code> · ${escapeHtml(f.category)}${f.severity ? '/' + f.severity : ''} · ${f.status}`);
      lines.push(`<i>${escapeHtml(t)}</i> · ${escapeHtml((f.url || '').slice(0, 50))}`);
      lines.push(escapeHtml((f.description || '').slice(0, 200)));
    }
    return { text: lines.join('\n').slice(0, 4000), status: 'OK' };
  }

  if (cmd === '/pr') {
    const n = parseInt(args.trim(), 10);
    if (!n) return { text: 'Usage: <code>/pr &lt;number&gt;</code>', status: 'ERR' };
    const pr = await ghApi(`/repos/${REPO}/pulls/${n}`, ghToken);
    if (pr.status !== 200) return { text: `❌ PR #${n}: ${pr.body?.message || pr.status}`, status: 'ERR' };
    const checks = await ghApi(`/repos/${REPO}/commits/${pr.body.head.sha}/check-runs`, ghToken);
    const reviews = await ghApi(`/repos/${REPO}/pulls/${n}/reviews`, ghToken);
    const failed = (checks.body.check_runs || []).filter((c: any) => ['failure', 'cancelled'].includes(c.conclusion));
    const reqChanges = (reviews.body || []).filter((r: any) => r.state === 'CHANGES_REQUESTED').length;
    const lines = [
      `<b>${escapeHtml(pr.body.title)}</b>`,
      `<a href="${pr.body.html_url}">PR #${n}</a> · ${pr.body.state} · ${pr.body.mergeable_state || '?'}`,
      `${pr.body.user.login} → ${pr.body.base.ref}`,
      `Checks: ${(checks.body.check_runs || []).length} total, ${failed.length} failed`,
      `Reviews: ${reviews.body?.length || 0} total, ${reqChanges} changes_requested`,
    ];
    return {
      text: lines.join('\n'),
      keyboard: pr.body.state === 'open' ? [[
        { text: '✅ Merge', callback_data: `merge:pr:${n}` },
        { text: '🔍 Review', url: pr.body.html_url },
      ]] : undefined,
      status: 'OK',
    };
  }

  if (cmd === '/merge') {
    const n = parseInt(args.trim(), 10);
    if (!n) return { text: 'Usage: <code>/merge &lt;number&gt;</code>', status: 'ERR' };
    const code = genConfirmCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { error } = await supabase.from('pending_confirmations').insert({
      chat_id: chatId, command: 'merge', args: { pr_number: n }, confirm_code: code, expires_at: expiresAt,
    });
    if (error) return { text: `❌ ${error.message}`, status: 'ERR' };
    const pr = await ghApi(`/repos/${REPO}/pulls/${n}`, ghToken);
    const title = pr.status === 200 ? pr.body.title : '(unknown)';
    return {
      text: `<b>⚠️ Confirmă merge PR #${n}</b>\n<i>${escapeHtml(title)}</i>\n\nRăspunde cu <code>/confirm ${code}</code> în 5 minute.`,
      status: 'CONFIRM_PENDING',
    };
  }

  if (cmd === '/deploy') {
    const app = args.trim().toLowerCase();
    if (!VERCEL_PROJECTS[app]) return { text: `Usage: <code>/deploy &lt;admin|web|courier&gt;</code>`, status: 'ERR' };
    const code = genConfirmCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await supabase.from('pending_confirmations').insert({
      chat_id: chatId, command: 'deploy', args: { app }, confirm_code: code, expires_at: expiresAt,
    });
    return {
      text: `<b>⚠️ Confirmă redeploy <code>${app}</code></b>\n\nRăspunde <code>/confirm ${code}</code> în 5 min.`,
      status: 'CONFIRM_PENDING',
    };
  }

  if (cmd === '/confirm') {
    const code = args.trim();
    if (!/^\d{4}$/.test(code)) return { text: 'Cod invalid. Trebuie 4 cifre.', status: 'ERR' };
    const { data: pend } = await supabase
      .from('pending_confirmations')
      .select('*')
      .eq('chat_id', chatId).eq('confirm_code', code).is('consumed_at', null)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!pend) return { text: `❌ Cod expirat sau deja folosit.`, status: 'CONFIRM_EXPIRED' };
    await supabase.from('pending_confirmations').update({ consumed_at: new Date().toISOString() }).eq('id', pend.id);

    if (pend.command === 'merge') {
      const n = pend.args.pr_number;
      const m = await ghApi(`/repos/${REPO}/pulls/${n}/merge`, ghToken, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_method: 'squash' }),
      });
      if (m.status === 200 && m.body.merged) {
        await supabase.from('pending_confirmations').update({ outcome: 'merged:' + m.body.sha }).eq('id', pend.id);
        await ghApi(`/repos/${REPO}/git/refs/heads/${encodeURIComponent(`auto-fix/feedback-${n}`)}`, ghToken, { method: 'DELETE' }).catch(() => {});
        return { text: `✅ PR #${n} merged → <code>${m.body.sha.slice(0, 7)}</code>`, status: 'OK' };
      }
      return { text: `❌ Merge failed: ${m.body?.message || m.status}`, status: 'ERR' };
    }
    if (pend.command === 'deploy') {
      const app = pend.args.app;
      const projectId = VERCEL_PROJECTS[app];
      const dep = await vercelApi('/v13/deployments', vercelToken, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: app === 'admin' ? 'hir-restaurant-admin' : app === 'web' ? 'hir-restaurant-web' : 'hir-pharma-courier',
          project: projectId, target: 'production',
          gitSource: { type: 'github', repoId: 1221036381, ref: 'main' } }),
      });
      if (dep.status === 200 || dep.status === 201) {
        await supabase.from('pending_confirmations').update({ outcome: 'deployed:' + dep.body.id }).eq('id', pend.id);
        return { text: `🚀 Deploy <code>${app}</code> pornit\n${dep.body.inspectorUrl || ''}`, status: 'OK' };
      }
      return { text: `❌ Deploy failed: ${JSON.stringify(dep.body).slice(0, 200)}`, status: 'ERR' };
    }
    return { text: '❌ Comandă necunoscută în pending.', status: 'ERR' };
  }

  if (cmd === '/ask') {
    const q = args.trim();
    if (!q) return { text: 'Usage: <code>/ask &lt;întrebare&gt;</code>', status: 'ERR' };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 800,
        system: 'Ești Hepi, asistentul AI al lui Iulian (CEO HIR Platform). Răspunzi concis în română, max 5 propoziții, ground în context HIR Restaurant Suite (multi-tenant Supabase + Next.js, alternativa la Wolt/Glovo cu 3 RON/livrare). Nu inventezi date pe care nu le ai. Dacă întrebarea cere acțiune, sugerezi comanda Telegram corectă.',
        messages: [{ role: 'user', content: q }],
      }),
    });
    if (!r.ok) return { text: `❌ Anthropic ${r.status}`, status: 'ERR' };
    const j = await r.json();
    const ans = j.content?.[0]?.text || '(empty response)';
    return { text: `<b>🤖 Hepi:</b>\n${escapeHtml(ans).slice(0, 3500)}`, status: 'OK' };
  }

  if (cmd === '/fix') {
    const id = args.trim();
    if (!/^[0-9a-f-]{8,}$/.test(id)) return { text: 'Usage: <code>/fix &lt;feedback_id_prefix&gt;</code>', status: 'ERR' };
    const { data: fb } = await supabase.from('feedback_reports').select('id,description,category').ilike('id', id + '%').maybeSingle();
    if (!fb) return { text: `❌ Feedback ${id} nu există.`, status: 'ERR' };
    await supabase.from('feedback_reports').update({ triage_routed_to_fix: true, status: 'TRIAGED' }).eq('id', fb.id);
    return { text: `🔧 Feedback <code>${fb.id.slice(0,8)}</code> rutat către Fix Agent.\n${escapeHtml(fb.description?.slice(0, 200) || '')}`, status: 'OK' };
  }

  if (cmd === '/audit') {
    const { data: rows } = await supabase
      .from('command_log').select('command,args,status,created_at')
      .eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10);
    if (!rows || rows.length === 0) return { text: 'Niciun audit log încă.', status: 'OK' };
    const lines = ['<b>📜 Ultimele 10 comenzi</b>'];
    for (const r of rows) {
      const t = new Date(r.created_at).toISOString().substring(11, 19);
      lines.push(`<code>${t}</code> ${escapeHtml(r.command)} ${escapeHtml((r.args || '').slice(0, 30))} · ${r.status}`);
    }
    return { text: lines.join('\n'), status: 'OK' };
  }

  return { text: `Comandă necunoscută: <code>${escapeHtml(cmd)}</code>\nFolosește /help`, status: 'UNKNOWN_COMMAND' };
}

async function handleCallback(
  supabase: any, ghToken: string, anthropicKey: string,
  data: string, chatId: number, callbackId: string, telegramToken: string
): Promise<string> {
  const [action, type, ...rest] = data.split(':');
  const id = rest.join(':');
  if (action === 'fix' && type === 'feedback') {
    await supabase.from('feedback_reports').update({ triage_routed_to_fix: true, status: 'TRIAGED' }).ilike('id', id + '%');
    await tgAnswerCallback(telegramToken, callbackId, '🔧 Routed to Fix Agent');
    return `🔧 Feedback ${id.slice(0, 8)} routed to Fix Agent.`;
  }
  if (action === 'manual' && type === 'feedback') {
    await supabase.from('feedback_reports').update({ status: 'HUMAN_FIX_NEEDED' }).ilike('id', id + '%');
    await tgAnswerCallback(telegramToken, callbackId, '✋ Marked human-only');
    return `✋ Feedback ${id.slice(0, 8)} marked as needs human review.`;
  }
  if (action === 'merge' && type === 'pr') {
    await tgAnswerCallback(telegramToken, callbackId, 'Send /merge ' + id + ' to start');
    return `Trimite <code>/merge ${id}</code> pentru a începe (cu confirm-code).`;
  }
  await tgAnswerCallback(telegramToken, callbackId, 'unknown');
  return `Acțiune necunoscută: ${data}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('ok', { status: 200, headers: corsHeaders });

  const start = Date.now();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
  const ghToken = Deno.env.get('GITHUB_TOKEN_FOR_BOT') ?? Deno.env.get('GITHUB_TOKEN') ?? '';
  const vercelToken = Deno.env.get('VERCEL_TOKEN_FOR_BOT') ?? Deno.env.get('VERCEL_TOKEN') ?? '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

  let payload: any;
  try { payload = await req.json(); }
  catch { return new Response('bad json', { status: 400, headers: corsHeaders }); }

  // Inline callback (button tap)
  if (payload.callback_query) {
    const cb = payload.callback_query;
    const chatId = cb.from?.id;
    if (chatId !== ALLOWED_CHAT_ID) {
      await tgAnswerCallback(tgToken, cb.id, '⛔ Unauthorized');
      return new Response(JSON.stringify({ ok: true, ignored: 'unauthorized' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const summary = await handleCallback(supabase, ghToken, anthropicKey, cb.data || '', chatId, cb.id, tgToken);
    await tgSend(tgToken, chatId, summary);
    EdgeRuntime.waitUntil(logCommand(supabase, {
      chat_id: chatId, message_id: cb.message?.message_id, username: cb.from?.username,
      command: 'callback:' + (cb.data || ''), status: 'OK', duration_ms: Date.now() - start,
    }));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Regular message
  const msg = payload.message ?? payload.edited_message;
  if (!msg) return new Response('ok', { status: 200, headers: corsHeaders });
  const chatId = msg.chat?.id;
  const text = msg.text ?? '';
  if (!chatId) return new Response('ok', { status: 200, headers: corsHeaders });

  if (chatId !== ALLOWED_CHAT_ID) {
    EdgeRuntime.waitUntil(logCommand(supabase, {
      chat_id: chatId, message_id: msg.message_id, username: msg.from?.username,
      command: text.slice(0, 50), status: 'UNAUTHORIZED', duration_ms: Date.now() - start,
    }));
    return new Response(JSON.stringify({ ok: true, ignored: 'unauthorized' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    // Treat as /ask
    const result = await handleCommand(supabase, ghToken, vercelToken, anthropicKey, '/ask', trimmed, chatId);
    await tgSend(tgToken, chatId, result.text, msg.message_id);
    EdgeRuntime.waitUntil(logCommand(supabase, {
      chat_id: chatId, message_id: msg.message_id, username: msg.from?.username,
      command: '/ask', args: trimmed.slice(0, 200), result_summary: result.text.slice(0, 200),
      status: result.status, duration_ms: Date.now() - start,
    }));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const space = trimmed.indexOf(' ');
  const cmd = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase().split('@')[0];
  const args = space === -1 ? '' : trimmed.slice(space + 1);

  const result = await handleCommand(supabase, ghToken, vercelToken, anthropicKey, cmd, args, chatId);
  await tgSend(tgToken, chatId, result.text, msg.message_id, result.keyboard);
  EdgeRuntime.waitUntil(logCommand(supabase, {
    chat_id: chatId, message_id: msg.message_id, username: msg.from?.username,
    command: cmd, args: args.slice(0, 500), result_summary: result.text.slice(0, 200),
    status: result.status, duration_ms: Date.now() - start,
  }));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
