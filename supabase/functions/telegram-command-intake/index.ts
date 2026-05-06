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
//   /tenant <slug>     — set active tenant for this chat (Hepy intents)
//   /help [hepy]       — list commands (or Hepy NL examples)
//   /status hepy       — last 10 Hepy intent runs
//
// Hepy NL intents (read-only, free-text, no slash):
//   "cum a mers azi/ieri/saptamana/luna" → orders_summary
//   "top produse [perioada]"             → top_products
//   "cate comenzi am acum"               → orders_now
//   "cati curieri sunt online"           → couriers_online
//   "ce recomandari am azi"              → recommendations_today
//   anything else → falls through to /ask (existing behavior).
//
// Inline-button callbacks (callback_query):
//   fix:feedback:<id>     — route to Fix Agent
//   manual:feedback:<id>  — mark needs human review
//   approve:fix:<id>      — squash-merge the auto-fix PR
//   reject:fix:<id>       — close the auto-fix PR

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withRunLog } from '../_shared/log.ts';

const ALLOWED_CHAT_ID = 1274150118; // Iulian (operator)
// PR B: bot is also reachable by tenant OWNERs that bound their Telegram
// account via /dashboard/settings/hepy. Authorization decided per-message
// in `authorizeChat()`.
const NONCE_TTL_MS = 60 * 60 * 1000; // 1h
const BOT_USERNAME = 'MasterHIRbot';
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
  // NOTE: PostgrestQueryBuilder is a thenable, not a real Promise — `.catch()`
  // is undefined on it. Always await inside try/catch (pre-existing bug
  // surfaced when the whole serve was wrapped in withRunLog; the unhandled
  // rejection from `.catch is not a function` killed the worker with 503).
  try {
    const { error } = await supabase.from('command_log').insert(row);
    if (error) console.warn('log fail', error.message);
  } catch (e) {
    console.warn('log threw', (e as Error)?.message);
  }
}

// =====================================================================
// HEPY — read-only intent router (PR A, lane 2026-05-06)
// =====================================================================
// Operator-only (already gated by ALLOWED_CHAT_ID). Maps free-text RO
// questions to grounded SQL queries against existing verified tables.
// Tenant context is set per-chat via `/tenant <slug>`; intents that need
// it return a friendly prompt if none is bound yet.
//
// Architecture:
//   - Regex classifier first (zero cost, deterministic, RO-aware).
//   - Anthropic Sonnet fallback ONLY if regex returns NONE *and* the text
//     is non-trivial (>=3 words). Sonnet is asked to pick one of the
//     known intent names or return NONE — it does NOT generate prose.
//     If it returns NONE, we fall through to /ask (existing behavior).
//   - All write actions deferred to PR C. Every handler here is SELECT-only.
//
// Audit trail: every executed intent writes one row to command_log
// (existing pipe) under command='hepy:<intent>' so /audit shows them,
// and one row to audit_log when a tenant is bound.

type HepyIntent =
  | 'orders_summary'        // "cum a mers azi/ieri/saptamana/luna"
  | 'top_products'          // "top produse [perioada]"
  | 'orders_now'            // "cate comenzi am acum"
  | 'couriers_online'       // "cati curieri sunt online"
  | 'recommendations_today' // "ce recomandari am azi"
  | 'NONE';

type HepyPeriod = 'today' | 'yesterday' | 'week' | 'month';

function detectIntentRegex(text: string): { intent: HepyIntent; period?: HepyPeriod } {
  // Strip diacritics for matching (Iulian sometimes types fără diacritice).
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

  let period: HepyPeriod | undefined;
  if (/\b(azi|astazi|today)\b/.test(t)) period = 'today';
  else if (/\b(ieri|yesterday)\b/.test(t)) period = 'yesterday';
  else if (/\b(saptamana|saptamina|week|7\s*zile)\b/.test(t)) period = 'week';
  else if (/\b(luna|lunii|month|30\s*zile)\b/.test(t)) period = 'month';

  if (/\bcate\s+comenzi\s+am\s+(acum|in\s+desfasurare|active)\b/.test(t) || /\bcomenzi\s+(acum|active|in\s+lucru)\b/.test(t)) {
    return { intent: 'orders_now' };
  }
  if (/\bcati\s+curieri\b/.test(t) || /\bcurieri\s+(online|activi|disponibili)\b/.test(t)) {
    return { intent: 'couriers_online' };
  }
  if (/\b(recomandari|sugestii|sfaturi)\b.*\b(azi|astazi|today|recent)\b/.test(t) || /\bce\s+(recomandari|sugestii)\b/.test(t)) {
    return { intent: 'recommendations_today' };
  }
  if (/\btop\s+(produse|preparate|items?)\b/.test(t) || /\b(cele\s+mai\s+vandute|bestsellers?)\b/.test(t)) {
    return { intent: 'top_products', period: period ?? 'week' };
  }
  if (/\bcum\s+a\s+mers\b/.test(t) || /\b(cifra|incasari|venit|comenzi)\b.*\b(azi|ieri|saptamana|luna)\b/.test(t) || (/\b(azi|ieri|saptamana|luna)\b/.test(t) && /\b(cum|cat)\b/.test(t))) {
    return { intent: 'orders_summary', period: period ?? 'today' };
  }
  return { intent: 'NONE' };
}

async function classifyIntentLLM(text: string, anthropicKey: string): Promise<{ intent: HepyIntent; period?: HepyPeriod }> {
  if (!anthropicKey) return { intent: 'NONE' };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 60,
        system: `You are an intent classifier for a Romanian restaurant ops bot. Map the user's message to ONE intent name from this list, or NONE.
Intents:
- orders_summary  (asks about how a period went; needs period: today|yesterday|week|month)
- top_products    (asks for best-selling items; needs period)
- orders_now      (asks about active/in-progress orders right now)
- couriers_online (asks how many couriers are online/available)
- recommendations_today (asks for AI growth recommendations)
- NONE (anything else, including general questions)

Reply with EXACTLY one line and nothing else:
INTENT=<name> PERIOD=<today|yesterday|week|month|none>`,
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (!r.ok) return { intent: 'NONE' };
    const j = await r.json();
    const out: string = j.content?.[0]?.text || '';
    const m = out.match(/INTENT=(\w+)\s+PERIOD=(\w+)/i);
    if (!m) return { intent: 'NONE' };
    const intent = m[1].toLowerCase() as HepyIntent;
    const periodRaw = m[2].toLowerCase();
    const allowed: HepyIntent[] = ['orders_summary', 'top_products', 'orders_now', 'couriers_online', 'recommendations_today', 'NONE'];
    if (!allowed.includes(intent)) return { intent: 'NONE' };
    const period = (['today', 'yesterday', 'week', 'month'].includes(periodRaw) ? periodRaw : undefined) as HepyPeriod | undefined;
    return { intent, period };
  } catch (e) {
    console.warn('classifyIntentLLM fail', (e as Error).message);
    return { intent: 'NONE' };
  }
}

function periodWindow(p: HepyPeriod): { from: Date; to: Date; label: string; prevFrom: Date; prevTo: Date } {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (p === 'today') {
    return { from: startOfToday, to: now, label: 'azi',
      prevFrom: new Date(startOfToday.getTime() - 24 * 3600 * 1000), prevTo: startOfToday };
  }
  if (p === 'yesterday') {
    const from = new Date(startOfToday.getTime() - 24 * 3600 * 1000);
    return { from, to: startOfToday, label: 'ieri',
      prevFrom: new Date(from.getTime() - 24 * 3600 * 1000), prevTo: from };
  }
  if (p === 'week') {
    const from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    return { from, to: now, label: 'ultimele 7 zile',
      prevFrom: new Date(from.getTime() - 7 * 24 * 3600 * 1000), prevTo: from };
  }
  const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  return { from, to: now, label: 'ultimele 30 de zile',
    prevFrom: new Date(from.getTime() - 30 * 24 * 3600 * 1000), prevTo: from };
}

function fmtRon(n: number): string {
  return n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RON';
}

function deltaPct(curr: number, prev: number): string {
  if (prev <= 0) return curr > 0 ? '(perioada anterioară 0)' : '';
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? '+' : '';
  const arrow = pct >= 0 ? '▲' : '▼';
  return `${arrow} ${sign}${pct.toFixed(1)}% vs. perioada anterioară`;
}

const TENANT_HINT = 'Hepy nu știe pentru ce restaurant. Setați mai întâi: <code>/tenant &lt;slug&gt;</code>\nExemplu: <code>/tenant foisorul-a</code>';

// =====================================================================
// PR B — Owner binding & authorization
// =====================================================================
// `authorizeChat` decides who can talk to the bot. There are two roles:
//   - operator (Iulian): chat_id === ALLOWED_CHAT_ID. Full access to ops
//     commands (/pr, /merge, /deploy, /fix) + Hepy intents with explicit
//     /tenant <slug> switching.
//   - owner: a tenant OWNER who bound this Telegram account via
//     /dashboard/settings/hepy → t.me/<bot>?start=connect_<nonce>. Scoped
//     to their tenant; can run read-only Hepy intents only.
//
// Anyone else is rejected (silently, except deep-link /start handler).

type ChatAuth =
  | { kind: 'operator' }
  | { kind: 'owner'; tenant_id: string; tenant_slug: string; tenant_name: string; owner_user_id: string; binding_id: string }
  | null;

async function authorizeChat(supabase: any, chatId: number): Promise<ChatAuth> {
  if (chatId === ALLOWED_CHAT_ID) return { kind: 'operator' };
  // Owner binding: telegram_user_id === DM chat_id.
  const { data: binding } = await supabase
    .from('hepy_owner_bindings')
    .select('id, tenant_id, owner_user_id, tenants:tenant_id (slug, name)')
    .eq('telegram_user_id', chatId)
    .is('unbound_at', null)
    .maybeSingle();
  if (!binding) return null;
  const t = (binding as any).tenants;
  return {
    kind: 'owner',
    tenant_id: binding.tenant_id,
    tenant_slug: t?.slug ?? '?',
    tenant_name: t?.name ?? '?',
    owner_user_id: binding.owner_user_id,
    binding_id: binding.id,
  };
}

async function consumeConnectNonce(
  supabase: any,
  nonce: string,
  telegramUserId: number,
  telegramUsername: string | undefined,
): Promise<
  | { ok: true; tenant_id: string; tenant_name: string; tenant_slug: string }
  | { ok: false; error: 'not_found' | 'expired' | 'already_consumed' | 'tenant_missing' | 'db_error'; detail?: string }
> {
  // 1) Look up + lock the nonce (single-row atomic via unique PK + the
  //    consumed_at IS NULL check below).
  const { data: row, error: selErr } = await supabase
    .from('hepy_connect_nonces')
    .select('nonce, tenant_id, owner_user_id, created_at, consumed_at')
    .eq('nonce', nonce)
    .maybeSingle();
  if (selErr) return { ok: false, error: 'db_error', detail: selErr.message };
  if (!row) return { ok: false, error: 'not_found' };
  if (row.consumed_at) return { ok: false, error: 'already_consumed' };
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > NONCE_TTL_MS) return { ok: false, error: 'expired' };

  // 2) Tenant lookup (we need name + slug for the success message).
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, name')
    .eq('id', row.tenant_id)
    .maybeSingle();
  if (!tenant) return { ok: false, error: 'tenant_missing' };

  // 3) If this Telegram user already had an active binding (perhaps to a
  //    different tenant), unbind it first — one TG account = one active
  //    tenant. We don't delete the row; we mark `unbound_at` for audit.
  await supabase
    .from('hepy_owner_bindings')
    .update({ unbound_at: new Date().toISOString() })
    .eq('telegram_user_id', telegramUserId)
    .is('unbound_at', null);

  // 4) Same for any prior active binding the OWNER held on this tenant
  //    (covers re-issue from the admin UI).
  await supabase
    .from('hepy_owner_bindings')
    .update({ unbound_at: new Date().toISOString() })
    .eq('owner_user_id', row.owner_user_id)
    .eq('tenant_id', row.tenant_id)
    .is('unbound_at', null);

  // 5) Atomic claim: only proceed if consumed_at is still NULL. Equivalent
  //    to SELECT FOR UPDATE in this read+update pattern under
  //    PostgREST — with the unique nonce PK + the IS NULL filter, two
  //    concurrent /start clicks either both see consumed_at=NULL and one
  //    update wins (upsert race) or one sees it filled and bails. We
  //    accept this best-effort guard because the worst case is the same
  //    OWNER getting two bindings (we already unbind any prior in step
  //    3), the rate is ~0/sec, and the unique partial index on
  //    (telegram_user_id WHERE unbound_at IS NULL) is the actual
  //    invariant we rely on.
  const { error: claimErr } = await supabase
    .from('hepy_connect_nonces')
    .update({ consumed_at: new Date().toISOString(), consumed_by_tg: telegramUserId })
    .eq('nonce', nonce)
    .is('consumed_at', null);
  if (claimErr) return { ok: false, error: 'db_error', detail: claimErr.message };

  // 6) Insert the new binding.
  const { error: insErr } = await supabase
    .from('hepy_owner_bindings')
    .insert({
      telegram_user_id: telegramUserId,
      tenant_id: row.tenant_id,
      owner_user_id: row.owner_user_id,
      telegram_username: telegramUsername ?? null,
      last_active_at: new Date().toISOString(),
    });
  if (insErr) return { ok: false, error: 'db_error', detail: insErr.message };

  // 7) Audit row in tenant audit_log.
  try {
    await supabase.from('audit_log').insert({
      tenant_id: row.tenant_id,
      action: 'hepy_telegram_bound',
      entity_type: 'hepy',
      entity_id: String(telegramUserId),
      metadata: {
        owner_user_id: row.owner_user_id,
        telegram_username: telegramUsername ?? null,
      },
    });
  } catch (e) {
    console.warn('hepy bound audit_log fail', (e as Error)?.message);
  }

  return { ok: true, tenant_id: tenant.id, tenant_name: tenant.name, tenant_slug: tenant.slug };
}

async function getActiveTenant(supabase: any, chatId: number, auth?: ChatAuth): Promise<{ tenant_id: string; slug: string; name: string } | null> {
  // PR B: an OWNER's tenant scope is fixed by the binding; never falls
  // back to the operator's manual /tenant pointer.
  if (auth?.kind === 'owner') {
    return { tenant_id: auth.tenant_id, slug: auth.tenant_slug, name: auth.tenant_name };
  }
  const { data: row } = await supabase
    .from('chat_active_tenant')
    .select('tenant_id, tenants:tenant_id (slug, name)')
    .eq('chat_id', String(chatId))
    .maybeSingle();
  if (!row) return null;
  const t = (row as any).tenants;
  return { tenant_id: row.tenant_id, slug: t?.slug ?? '?', name: t?.name ?? '?' };
}

async function setActiveTenant(supabase: any, chatId: number, slug: string): Promise<{ ok: boolean; tenant?: { id: string; slug: string; name: string }; error?: string }> {
  const { data: t, error } = await supabase
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!t) return { ok: false, error: 'not_found' };
  const { error: upErr } = await supabase
    .from('chat_active_tenant')
    .upsert({ chat_id: String(chatId), tenant_id: t.id, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, tenant: t };
}

async function logHepyAudit(supabase: any, tenantId: string, intent: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await supabase
      .from('audit_log')
      .insert({
        tenant_id: tenantId,
        action: 'hepy_intent',
        entity_type: 'hepy',
        entity_id: intent,
        metadata: payload,
      });
    if (error) console.warn('hepy audit_log fail', error.message);
  } catch (e) {
    console.warn('hepy audit_log threw', (e as Error)?.message);
  }
}

async function runIntent(
  supabase: any,
  intent: HepyIntent,
  period: HepyPeriod | undefined,
  chatId: number,
  auth: ChatAuth,
): Promise<{ text: string; status: string; intentRan?: HepyIntent }> {
  const tenant = await getActiveTenant(supabase, chatId, auth);

  if (intent === 'orders_now') {
    if (!tenant) return { text: TENANT_HINT, status: 'NEEDS_TENANT' };
    const active = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'IN_DELIVERY'];
    const { count } = await supabase
      .from('restaurant_orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.tenant_id)
      .in('status', active);
    await logHepyAudit(supabase, tenant.tenant_id, 'orders_now', { count });
    const c = count ?? 0;
    return {
      text: `<b>📋 ${escapeHtml(tenant.name)} — comenzi în desfășurare</b>\n${c} comen${c === 1 ? 'dă' : 'zi'} active acum.`,
      status: 'OK',
      intentRan: 'orders_now',
    };
  }

  if (intent === 'couriers_online') {
    const { count } = await supabase
      .from('courier_shifts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ONLINE');
    if (tenant) await logHepyAudit(supabase, tenant.tenant_id, 'couriers_online', { count });
    const c = count ?? 0;
    return {
      text: `<b>🛵 Curieri online acum</b>\n${c} curier${c === 1 ? '' : 'i'} în tură.`,
      status: 'OK',
      intentRan: 'couriers_online',
    };
  }

  if (intent === 'recommendations_today') {
    if (!tenant) return { text: TENANT_HINT, status: 'NEEDS_TENANT' };
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: recs } = await supabase
      .from('growth_recommendations')
      .select('priority, category, title_ro, suggested_action_ro, generated_at, status')
      .eq('tenant_id', tenant.tenant_id)
      .gte('generated_at', since)
      .order('generated_at', { ascending: false })
      .limit(5);
    await logHepyAudit(supabase, tenant.tenant_id, 'recommendations_today', { returned: recs?.length ?? 0 });
    if (!recs || recs.length === 0) {
      return { text: `<b>💡 ${escapeHtml(tenant.name)} — recomandări recente</b>\nNicio recomandare nouă în ultimele 7 zile.`, status: 'OK', intentRan: 'recommendations_today' };
    }
    const lines = [`<b>💡 ${escapeHtml(tenant.name)} — recomandări (ultimele 7 zile)</b>`];
    const prioEmoji: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
    for (const r of recs) {
      const e = prioEmoji[r.priority] ?? '·';
      lines.push(`\n${e} <b>${escapeHtml(r.title_ro)}</b>`);
      lines.push(`<i>${escapeHtml(r.category)}</i> · ${escapeHtml((r.suggested_action_ro || '').slice(0, 180))}`);
    }
    return { text: lines.join('\n').slice(0, 4000), status: 'OK', intentRan: 'recommendations_today' };
  }

  if (intent === 'orders_summary') {
    if (!tenant) return { text: TENANT_HINT, status: 'NEEDS_TENANT' };
    const p = period ?? 'today';
    const win = periodWindow(p);
    const { data: curr } = await supabase
      .from('restaurant_orders')
      .select('total_ron, status, items')
      .eq('tenant_id', tenant.tenant_id)
      .gte('created_at', win.from.toISOString())
      .lt('created_at', win.to.toISOString());
    const { data: prev } = await supabase
      .from('restaurant_orders')
      .select('total_ron, status')
      .eq('tenant_id', tenant.tenant_id)
      .gte('created_at', win.prevFrom.toISOString())
      .lt('created_at', win.prevTo.toISOString());

    const isRevenueStatus = (s: string) => s !== 'CANCELLED';
    const totalCurr = (curr ?? []).filter((o: any) => isRevenueStatus(o.status)).length;
    const revenueCurr = (curr ?? []).filter((o: any) => isRevenueStatus(o.status)).reduce((a: number, o: any) => a + Number(o.total_ron || 0), 0);
    const cancelledCurr = (curr ?? []).filter((o: any) => o.status === 'CANCELLED').length;
    const totalPrev = (prev ?? []).filter((o: any) => isRevenueStatus(o.status)).length;
    const revenuePrev = (prev ?? []).filter((o: any) => isRevenueStatus(o.status)).reduce((a: number, o: any) => a + Number(o.total_ron || 0), 0);

    const counts: Record<string, { qty: number; revenue: number }> = {};
    for (const o of curr ?? []) {
      if (!isRevenueStatus(o.status)) continue;
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const name = typeof it?.name === 'string' ? it.name : (typeof it?.title === 'string' ? it.title : null);
        if (!name) continue;
        const qty = Number(it?.quantity ?? it?.qty ?? 1);
        // Storefront orders write camelCase (priceRon, lineTotalRon); legacy
        // imports may use snake_case. Prefer lineTotalRon if present so we
        // don't double-multiply by qty.
        const lineTotal = Number(it?.lineTotalRon ?? it?.line_total_ron ?? NaN);
        const unitPrice = Number(it?.priceRon ?? it?.price_ron ?? it?.unit_price ?? it?.price ?? 0);
        const revenue = Number.isFinite(lineTotal) ? lineTotal : qty * unitPrice;
        if (!counts[name]) counts[name] = { qty: 0, revenue: 0 };
        counts[name].qty += qty;
        counts[name].revenue += revenue;
      }
    }
    const top3 = Object.entries(counts).sort((a, b) => b[1].qty - a[1].qty).slice(0, 3);

    await logHepyAudit(supabase, tenant.tenant_id, 'orders_summary', { period: p, total: totalCurr, revenue: revenueCurr });

    const lines = [
      `<b>📊 ${escapeHtml(tenant.name)} — cum a mers ${win.label}</b>`,
      ``,
      `Comenzi: <b>${totalCurr}</b>  ${escapeHtml(deltaPct(totalCurr, totalPrev))}`,
      `Încasări: <b>${escapeHtml(fmtRon(revenueCurr))}</b>  ${escapeHtml(deltaPct(revenueCurr, revenuePrev))}`,
    ];
    if (cancelledCurr > 0) lines.push(`Anulate: ${cancelledCurr}`);
    if (top3.length) {
      lines.push('', '<b>Top produse:</b>');
      for (const [name, agg] of top3) {
        lines.push(`· ${escapeHtml(name)} — ${agg.qty} buc · ${escapeHtml(fmtRon(agg.revenue))}`);
      }
    } else {
      lines.push('', '<i>Niciun produs vândut în această perioadă.</i>');
    }
    return { text: lines.join('\n').slice(0, 4000), status: 'OK', intentRan: 'orders_summary' };
  }

  if (intent === 'top_products') {
    if (!tenant) return { text: TENANT_HINT, status: 'NEEDS_TENANT' };
    const p = period ?? 'week';
    const win = periodWindow(p);
    const { data: curr } = await supabase
      .from('restaurant_orders')
      .select('items, status')
      .eq('tenant_id', tenant.tenant_id)
      .gte('created_at', win.from.toISOString())
      .lt('created_at', win.to.toISOString());
    const counts: Record<string, { qty: number; revenue: number }> = {};
    for (const o of curr ?? []) {
      if (o.status === 'CANCELLED') continue;
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const name = typeof it?.name === 'string' ? it.name : (typeof it?.title === 'string' ? it.title : null);
        if (!name) continue;
        const qty = Number(it?.quantity ?? it?.qty ?? 1);
        // Storefront orders write camelCase (priceRon, lineTotalRon); legacy
        // imports may use snake_case. Prefer lineTotalRon if present so we
        // don't double-multiply by qty.
        const lineTotal = Number(it?.lineTotalRon ?? it?.line_total_ron ?? NaN);
        const unitPrice = Number(it?.priceRon ?? it?.price_ron ?? it?.unit_price ?? it?.price ?? 0);
        const revenue = Number.isFinite(lineTotal) ? lineTotal : qty * unitPrice;
        if (!counts[name]) counts[name] = { qty: 0, revenue: 0 };
        counts[name].qty += qty;
        counts[name].revenue += revenue;
      }
    }
    const top10 = Object.entries(counts).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
    await logHepyAudit(supabase, tenant.tenant_id, 'top_products', { period: p, returned: top10.length });
    if (top10.length === 0) {
      return { text: `<b>🍽️ ${escapeHtml(tenant.name)} — top produse (${win.label})</b>\nNiciun produs vândut în această perioadă.`, status: 'OK', intentRan: 'top_products' };
    }
    const lines = [`<b>🍽️ ${escapeHtml(tenant.name)} — top produse (${win.label})</b>`];
    let i = 1;
    for (const [name, agg] of top10) {
      lines.push(`${i}. ${escapeHtml(name)} — ${agg.qty} buc · ${escapeHtml(fmtRon(agg.revenue))}`);
      i++;
    }
    return { text: lines.join('\n').slice(0, 4000), status: 'OK', intentRan: 'top_products' };
  }

  return { text: '', status: 'NONE' };
}

// PR B intent helpers — used by both /comenzi /stoc /vanzari slash commands
// and (later, in PR C) free-text owner questions.
async function ownerOrdersToday(supabase: any, tenant: { tenant_id: string; name: string }): Promise<{ text: string; status: string }> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const { data: orders } = await supabase
    .from('restaurant_orders')
    .select('id, status, total_ron, created_at')
    .eq('tenant_id', tenant.tenant_id)
    .gte('created_at', startOfToday.toISOString())
    .order('created_at', { ascending: false })
    .limit(50);
  await logHepyAudit(supabase, tenant.tenant_id, 'comenzi_today', { returned: orders?.length ?? 0 });
  if (!orders || orders.length === 0) {
    return { text: `<b>📋 ${escapeHtml(tenant.name)} — comenzi azi</b>\nNicio comandă astăzi încă.`, status: 'OK' };
  }
  const active = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'IN_DELIVERY'];
  const activeCount = orders.filter((o: any) => active.includes(o.status)).length;
  const cancelled = orders.filter((o: any) => o.status === 'CANCELLED').length;
  const delivered = orders.filter((o: any) => o.status === 'DELIVERED').length;
  const lines = [
    `<b>📋 ${escapeHtml(tenant.name)} — comenzi azi</b>`,
    `Total: <b>${orders.length}</b> · Active: ${activeCount} · Livrate: ${delivered}${cancelled > 0 ? ` · Anulate: ${cancelled}` : ''}`,
    '',
    '<b>Ultimele 10:</b>',
  ];
  for (const o of orders.slice(0, 10)) {
    const t = new Date(o.created_at).toISOString().substring(11, 16);
    const total = fmtRon(Number(o.total_ron || 0));
    lines.push(`<code>${t}</code> · ${escapeHtml(o.status)} · ${escapeHtml(total)}`);
  }
  return { text: lines.join('\n').slice(0, 4000), status: 'OK' };
}

async function ownerSalesToday(supabase: any, tenant: { tenant_id: string; name: string }): Promise<{ text: string; status: string }> {
  // Today + yesterday for the trend line.
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfYday = new Date(startOfToday.getTime() - 24 * 3600 * 1000);
  const [{ data: today }, { data: yday }] = await Promise.all([
    supabase
      .from('restaurant_orders')
      .select('total_ron, status')
      .eq('tenant_id', tenant.tenant_id)
      .gte('created_at', startOfToday.toISOString()),
    supabase
      .from('restaurant_orders')
      .select('total_ron, status')
      .eq('tenant_id', tenant.tenant_id)
      .gte('created_at', startOfYday.toISOString())
      .lt('created_at', startOfToday.toISOString()),
  ]);
  const sumRevenue = (rows: any[] | null) =>
    (rows ?? []).filter((o: any) => o.status !== 'CANCELLED').reduce((a: number, o: any) => a + Number(o.total_ron || 0), 0);
  const sumCount = (rows: any[] | null) =>
    (rows ?? []).filter((o: any) => o.status !== 'CANCELLED').length;
  const todayRev = sumRevenue(today);
  const ydayRev = sumRevenue(yday);
  const todayCnt = sumCount(today);
  await logHepyAudit(supabase, tenant.tenant_id, 'vanzari_today', { revenue: todayRev, count: todayCnt });
  const lines = [
    `<b>💰 ${escapeHtml(tenant.name)} — vânzări azi</b>`,
    `Încasări: <b>${escapeHtml(fmtRon(todayRev))}</b>  ${escapeHtml(deltaPct(todayRev, ydayRev))}`,
    `Comenzi: <b>${todayCnt}</b>`,
  ];
  return { text: lines.join('\n'), status: 'OK' };
}

async function ownerLowStock(supabase: any, tenant: { tenant_id: string; name: string }): Promise<{ text: string; status: string }> {
  // Inventory v1 ships in a parallel lane (HIR-inventory-worktree). If
  // the table doesn't exist yet, return a graceful "în curând" message
  // instead of a 500. We probe by attempting a HEAD count and treating
  // the "relation does not exist" PostgREST error code (PGRST205 / 42P01)
  // as not-yet-shipped.
  const { error } = await supabase
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.tenant_id)
    .limit(1);
  if (error) {
    const code = (error as any)?.code ?? '';
    const msg = String((error as any)?.message ?? '');
    if (code === 'PGRST205' || code === '42P01' || /does not exist/i.test(msg) || /Could not find the table/i.test(msg)) {
      return {
        text: `<b>📦 ${escapeHtml(tenant.name)} — stoc</b>\n<i>Modulul Inventar nu este încă activ pentru contul dumneavoastră.</i>\n\nVeți primi notificare când va fi disponibil.`,
        status: 'OK',
      };
    }
    return { text: `<b>📦 Stoc</b>\nA apărut o eroare temporară. Reîncercați în câteva minute.`, status: 'ERR' };
  }
  // Inventory v1 schema (per HIR-inventory worktree spec): fields likely
  // include `current_qty` + `low_stock_threshold` + `name`. We fetch
  // generously and filter in app code so a slight schema variance doesn't
  // break the bot.
  const { data: items } = await supabase
    .from('inventory_items')
    .select('id, name, current_qty, low_stock_threshold, unit')
    .eq('tenant_id', tenant.tenant_id)
    .order('name', { ascending: true })
    .limit(200);
  const low = (items ?? []).filter((it: any) => {
    const q = Number(it.current_qty);
    const th = Number(it.low_stock_threshold);
    return Number.isFinite(q) && Number.isFinite(th) && th > 0 && q <= th;
  });
  await logHepyAudit(supabase, tenant.tenant_id, 'stoc_low', { returned: low.length });
  if (low.length === 0) {
    return { text: `<b>📦 ${escapeHtml(tenant.name)} — stoc</b>\n✅ Nicio poziție sub prag.`, status: 'OK' };
  }
  const lines = [`<b>📦 ${escapeHtml(tenant.name)} — poziții sub prag (${low.length})</b>`];
  for (const it of low.slice(0, 20)) {
    const unit = it.unit ? ` ${escapeHtml(it.unit)}` : '';
    lines.push(`· ${escapeHtml(it.name)} — ${it.current_qty}${unit} (prag ${it.low_stock_threshold})`);
  }
  if (low.length > 20) lines.push(`…și încă ${low.length - 20}`);
  return { text: lines.join('\n').slice(0, 4000), status: 'OK' };
}

async function handleCommand(
  supabase: any, ghToken: string, vercelToken: string, anthropicKey: string,
  cmd: string, args: string, chatId: number, auth: ChatAuth, telegramUsername?: string
): Promise<{ text: string; keyboard?: any[][]; status: string }> {
  // ────────────────────────────────────────────────────────────
  // PR B: /start connect_<nonce> deep link (no auth gate — this is
  // how anonymous users self-bind). Handled BEFORE the help branch.
  // ────────────────────────────────────────────────────────────
  if (cmd === '/start' && args.trim().toLowerCase().startsWith('connect_')) {
    const nonce = args.trim().slice('connect_'.length);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
      return { text: '❌ Link invalid. Reveniți la pagina de setări și generați un link nou.', status: 'ERR' };
    }
    const r = await consumeConnectNonce(supabase, nonce, chatId, telegramUsername);
    if (!r.ok) {
      const msg: Record<string, string> = {
        not_found: 'Link expirat sau folosit. Generați unul nou din /dashboard/settings/hepy.',
        expired: 'Link expirat (>1 oră). Generați unul nou din /dashboard/settings/hepy.',
        already_consumed: 'Acest link a fost deja folosit. Generați unul nou dacă doriți să reconectați.',
        tenant_missing: 'Restaurantul nu mai există. Contactați-ne.',
        db_error: 'Eroare temporară. Reîncercați în câteva secunde.',
      };
      return { text: `❌ ${msg[r.error] ?? 'Eroare necunoscută.'}`, status: 'ERR' };
    }
    return {
      text: `✅ <b>Hepy este conectat la ${escapeHtml(r.tenant_name)}.</b>

Acum puteți întreba liber, fără slug:
· <i>câte comenzi am azi</i>
· <i>cum a mers ieri</i>
· <i>top produse</i>

Sau folosiți comenzile rapide:
/comenzi — comenzile de astăzi
/vanzari — încasările de astăzi
/stoc — pozițiile sub prag
/help hepy — toate comenzile`,
      status: 'OK',
    };
  }

  if (cmd === '/help' || cmd === '/start') {
    const sub = args.trim().toLowerCase();
    if (auth?.kind === 'owner') {
      return {
        text: `<b>💬 Hepy — ${escapeHtml(auth.tenant_name)}</b>

Întrebări în limbaj natural:
· <i>câte comenzi am acum</i>
· <i>cum a mers azi / ieri / săptămâna</i>
· <i>top produse</i>
· <i>ce recomandări am azi</i>

Comenzi rapide:
/comenzi — comenzile de astăzi
/vanzari — încasările de astăzi
/stoc — pozițiile sub prag
/help — acest ecran

Pentru a deconecta acest cont, accesați
<i>Setări → Hepy</i> în panoul de administrare.`,
        status: 'OK',
      };
    }
    if (sub === 'hepy') {
      return {
        text: `<b>💬 Hepy — întrebări în limbaj natural</b>

Setați mai întâi restaurantul activ:
<code>/tenant &lt;slug&gt;</code>  (ex. <code>/tenant foisorul-a</code>)

Apoi puteți întreba liber:
· <i>cum a mers azi / ieri / săptămâna / luna</i>
· <i>top produse [perioada]</i>
· <i>câte comenzi am acum</i>
· <i>câți curieri sunt online</i>
· <i>ce recomandări am azi</i>

Comenzi auxiliare:
/tenant &lt;slug&gt; — setați restaurantul activ pentru chat
/status hepy — ultimele 10 intent-uri Hepy rulate
/help hepy — acest ecran`,
        status: 'OK',
      };
    }
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
/audit — ultimele 10 comenzi rulate

<b>💬 Hepy (read-only):</b>
/tenant &lt;slug&gt; — setați restaurantul activ
/help hepy — întrebări în limbaj natural
/status hepy — ultimele intent-uri Hepy`,
      status: 'OK',
    };
  }

  // ────────────────────────────────────────────────────────────
  // PR B: owner-only quick commands. Operator may also run them
  // (their active tenant via /tenant).
  // ────────────────────────────────────────────────────────────
  if (cmd === '/comenzi' || cmd === '/vanzari' || cmd === '/stoc') {
    const tenant = await getActiveTenant(supabase, chatId, auth);
    if (!tenant) return { text: TENANT_HINT, status: 'NEEDS_TENANT' };
    if (cmd === '/comenzi') return await ownerOrdersToday(supabase, tenant);
    if (cmd === '/vanzari') return await ownerSalesToday(supabase, tenant);
    return await ownerLowStock(supabase, tenant);
  }

  // ────────────────────────────────────────────────────────────
  // PR B: OWNER-scope hard ban on operator-only commands. Anything
  // below this line touches ops infrastructure (GitHub, Vercel,
  // global feedback queue) and is operator-only.
  // ────────────────────────────────────────────────────────────
  if (auth?.kind === 'owner') {
    return {
      text: `Comanda <code>${escapeHtml(cmd)}</code> nu este disponibilă în acest cont. Folosiți /help pentru a vedea comenzile permise.`,
      status: 'OWNER_FORBIDDEN',
    };
  }

  if (cmd === '/tenant') {
    const slug = args.trim().toLowerCase();
    if (!slug) {
      const cur = await getActiveTenant(supabase, chatId, auth);
      if (cur) return { text: `Restaurant activ: <b>${escapeHtml(cur.name)}</b> (<code>${escapeHtml(cur.slug)}</code>)\n\nSchimbați cu: <code>/tenant &lt;slug&gt;</code>`, status: 'OK' };
      return { text: 'Niciun restaurant setat. Folosiți <code>/tenant &lt;slug&gt;</code>.', status: 'OK' };
    }
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) return { text: 'Slug invalid. Trebuie litere mici, cifre, cratimă.', status: 'ERR' };
    const r = await setActiveTenant(supabase, chatId, slug);
    if (!r.ok) {
      if (r.error === 'not_found') return { text: `❌ Niciun restaurant cu slug <code>${escapeHtml(slug)}</code>.`, status: 'ERR' };
      return { text: `❌ ${escapeHtml(r.error || 'eroare')}`, status: 'ERR' };
    }
    return { text: `✅ Restaurant activ: <b>${escapeHtml(r.tenant!.name)}</b> (<code>${escapeHtml(r.tenant!.slug)}</code>)\n\nÎncercați: <i>cum a mers ieri</i>`, status: 'OK' };
  }

  if (cmd === '/status' && args.trim().toLowerCase() === 'hepy') {
    const { data: rows } = await supabase
      .from('function_runs')
      .select('started_at, status, duration_ms, metadata, error_text')
      .eq('function_name', 'telegram-command-intake')
      .contains('metadata', { hepy: true })
      .order('started_at', { ascending: false })
      .limit(10);
    if (!rows || rows.length === 0) return { text: '<b>💬 Hepy — ultimele intent-uri</b>\nNiciun intent rulat încă.', status: 'OK' };
    const lines = ['<b>💬 Hepy — ultimele 10 intent-uri</b>'];
    for (const r of rows) {
      const t = new Date(r.started_at).toISOString().substring(11, 19);
      const intent = (r.metadata as any)?.intent ?? '?';
      const status = r.status === 'SUCCESS' ? '✅' : r.status === 'ERROR' ? '❌' : '⏳';
      const dur = r.duration_ms ? `${r.duration_ms}ms` : '—';
      lines.push(`${status} <code>${t}</code> ${escapeHtml(intent)} · ${dur}`);
    }
    return { text: lines.join('\n'), status: 'OK' };
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

  return withRunLog('telegram-command-intake', async ({ setMetadata }) => {
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
    const tgUsername = msg.from?.username;
    if (!chatId) return new Response('ok', { status: 200, headers: corsHeaders });

    const trimmed = text.trim();

    // PR B: authorize the chat. Three outcomes:
    //   - operator (Iulian) → full access
    //   - owner (bound TG) → owner-scoped Hepy
    //   - null (anonymous) → only the /start connect_<nonce> deep link is
    //     allowed; everything else gets silently ignored (logged as
    //     UNAUTHORIZED for the audit trail).
    const auth = await authorizeChat(supabase, chatId);

    const isStartConnect =
      trimmed.startsWith('/start') &&
      /^\/start(?:@\w+)?\s+connect_[A-Za-z0-9_-]{8,}/i.test(trimmed);

    if (!auth && !isStartConnect) {
      EdgeRuntime.waitUntil(logCommand(supabase, {
        chat_id: chatId, message_id: msg.message_id, username: tgUsername,
        command: text.slice(0, 50), status: 'UNAUTHORIZED', duration_ms: Date.now() - start,
      }));
      return new Response(JSON.stringify({ ok: true, ignored: 'unauthorized' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Refresh last_active_at for owner bindings (best-effort, never blocks).
    if (auth?.kind === 'owner') {
      EdgeRuntime.waitUntil(
        supabase
          .from('hepy_owner_bindings')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', auth.binding_id)
          .then(() => undefined, (e: unknown) => console.warn('hepy last_active update fail', (e as Error)?.message))
      );
    }

    // Non-slash text: try Hepy intent router first; fall through to /ask if NONE.
    // Owners only ever hit the intent router (owner-forbidden ops commands
    // are handled inside handleCommand).
    if (!trimmed.startsWith('/')) {
      // 1) Regex classifier (zero cost)
      let cls = detectIntentRegex(trimmed);
      let usedLLM = false;
      // 2) LLM fallback only if regex returned NONE and the message has substance.
      if (cls.intent === 'NONE' && trimmed.split(/\s+/).length >= 3) {
        const llm = await classifyIntentLLM(trimmed, anthropicKey);
        if (llm.intent !== 'NONE') {
          cls = llm;
          usedLLM = true;
        }
      }

      if (cls.intent !== 'NONE') {
        const ir = await runIntent(supabase, cls.intent, cls.period, chatId, auth);
        await tgSend(tgToken, chatId, ir.text, msg.message_id);
        setMetadata({ hepy: true, intent: cls.intent, period: cls.period ?? null, used_llm_classifier: usedLLM, intent_status: ir.status, role: auth?.kind ?? 'anon' });
        EdgeRuntime.waitUntil(logCommand(supabase, {
          chat_id: chatId, message_id: msg.message_id, username: tgUsername,
          command: 'hepy:' + cls.intent, args: trimmed.slice(0, 200), result_summary: ir.text.slice(0, 200),
          status: ir.status, duration_ms: Date.now() - start,
        }));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 3) No intent matched.
      //    For OWNERs we do NOT proxy free-text to /ask (Anthropic) — they
      //    get a friendly nudge instead. Only the operator falls through.
      if (auth?.kind === 'owner') {
        const reply = `Hepy nu a înțeles întrebarea. Încercați:\n· <i>câte comenzi am azi</i>\n· <i>cum a mers ieri</i>\n· <i>top produse</i>\n\nSau /help pentru lista completă.`;
        await tgSend(tgToken, chatId, reply, msg.message_id);
        EdgeRuntime.waitUntil(logCommand(supabase, {
          chat_id: chatId, message_id: msg.message_id, username: tgUsername,
          command: 'hepy:none', args: trimmed.slice(0, 200), result_summary: reply.slice(0, 200),
          status: 'OWNER_NO_INTENT', duration_ms: Date.now() - start,
        }));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const result = await handleCommand(supabase, ghToken, vercelToken, anthropicKey, '/ask', trimmed, chatId, auth, tgUsername);
      await tgSend(tgToken, chatId, result.text, msg.message_id);
      EdgeRuntime.waitUntil(logCommand(supabase, {
        chat_id: chatId, message_id: msg.message_id, username: tgUsername,
        command: '/ask', args: trimmed.slice(0, 200), result_summary: result.text.slice(0, 200),
        status: result.status, duration_ms: Date.now() - start,
      }));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const space = trimmed.indexOf(' ');
    const cmd = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase().split('@')[0];
    const args = space === -1 ? '' : trimmed.slice(space + 1);

    const result = await handleCommand(supabase, ghToken, vercelToken, anthropicKey, cmd, args, chatId, auth, tgUsername);
    await tgSend(tgToken, chatId, result.text, msg.message_id, result.keyboard);
    if (cmd === '/tenant' || cmd === '/comenzi' || cmd === '/vanzari' || cmd === '/stoc' || (cmd === '/help' && args.trim().toLowerCase() === 'hepy') || (cmd === '/status' && args.trim().toLowerCase() === 'hepy')) {
      setMetadata({ hepy: true, intent: cmd.slice(1) + (args ? ':' + args.trim().toLowerCase() : ''), role: auth?.kind ?? 'anon' });
    }
    EdgeRuntime.waitUntil(logCommand(supabase, {
      chat_id: chatId, message_id: msg.message_id, username: tgUsername,
      command: cmd, args: args.slice(0, 500), result_summary: result.text.slice(0, 200),
      status: result.status, duration_ms: Date.now() - start,
    }));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  });
});
