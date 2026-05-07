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
// Hepy reservation booking (OWNER-only, write):
//   /rezerva [one-liner]            — book a table; if all fields are
//                                     present in the one-liner, commits
//                                     immediately; otherwise asks for the
//                                     missing fields step-by-step
//   /rezervari                      — list upcoming reservations (next 14d)
//   /anuleaza_rezervare <token>     — cancel a reservation by public token
// Default-enabled when the tenant has BOTH a hepy_owner_bindings row AND
// reservation_settings.is_enabled=true; disabled otherwise (friendly
// "rezervările nu sunt activate" reply).
//
// Inline-button callbacks (callback_query):
//   fix:feedback:<id>     — route to Fix Agent
//   manual:feedback:<id>  — mark needs human review
//   approve:fix:<id>      — squash-merge the auto-fix PR
//   reject:fix:<id>       — close the auto-fix PR

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withRunLog } from '../_shared/log.ts';
import {
  parseReservation,
  missingFields,
  type ParsedReservation,
} from '../_shared/reservation-parser.ts';

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

  // Codex P1 (PR B review): re-check membership on EVERY message. If the
  // OWNER was demoted to STAFF or removed from tenant_members after the
  // binding was created, they must lose Telegram access immediately —
  // the binding row alone is not authoritative. We auto-mark the binding
  // unbound to keep state consistent (idempotent best-effort).
  const { data: stillOwner } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('user_id', binding.owner_user_id)
    .eq('tenant_id', binding.tenant_id)
    .eq('role', 'OWNER')
    .maybeSingle();
  if (!stillOwner) {
    // Best-effort revocation; don't block the rejection on the update.
    supabase
      .from('hepy_owner_bindings')
      .update({ unbound_at: new Date().toISOString() })
      .eq('id', binding.id)
      .is('unbound_at', null)
      .then(() => undefined, (e: unknown) => console.warn('hepy auto-unbind on demote fail', (e as Error)?.message));
    return null;
  }

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

  // Codex P1 (PR B review): the user might have been demoted between
  // mint-time and click-time. Re-check OWNER membership before claiming
  // the nonce. If they are no longer OWNER, mark the nonce consumed
  // (one-shot anyway) and reject without creating a binding.
  const { data: stillOwner } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('user_id', row.owner_user_id)
    .eq('tenant_id', row.tenant_id)
    .eq('role', 'OWNER')
    .maybeSingle();
  if (!stillOwner) {
    await supabase
      .from('hepy_connect_nonces')
      .update({ consumed_at: new Date().toISOString(), consumed_by_tg: telegramUserId })
      .eq('nonce', nonce)
      .is('consumed_at', null);
    return { ok: false, error: 'not_found' }; // surface as "link expirat sau folosit"
  }

  // 3) Claim the nonce FIRST (atomic-ish: PK + IS NULL filter). If two
  //    concurrent /start clicks land, only one update affects a row;
  //    the other sees zero affected rows. We use .select() to confirm
  //    that we won the race before mutating any binding state.
  const { data: claimed, error: claimErr } = await supabase
    .from('hepy_connect_nonces')
    .update({ consumed_at: new Date().toISOString(), consumed_by_tg: telegramUserId })
    .eq('nonce', nonce)
    .is('consumed_at', null)
    .select('nonce')
    .maybeSingle();
  if (claimErr) return { ok: false, error: 'db_error', detail: claimErr.message };
  if (!claimed) return { ok: false, error: 'already_consumed' };

  // 4) Now that we've won the nonce, unbind any prior active binding
  //    for THIS Telegram user (one TG account = one active tenant) and
  //    for THIS (owner, tenant) pair (re-issue from admin UI). Best
  //    effort — the unique partial index on
  //    (telegram_user_id WHERE unbound_at IS NULL) is the real invariant.
  await supabase
    .from('hepy_owner_bindings')
    .update({ unbound_at: new Date().toISOString() })
    .eq('telegram_user_id', telegramUserId)
    .is('unbound_at', null);
  await supabase
    .from('hepy_owner_bindings')
    .update({ unbound_at: new Date().toISOString() })
    .eq('owner_user_id', row.owner_user_id)
    .eq('tenant_id', row.tenant_id)
    .is('unbound_at', null);

  // 5) Insert the new binding.
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

// =====================================================================
// HEPY — Reservation booking (write, OWNER-only)
// =====================================================================
// Three intents: /rezerva (book), /rezervari (list), /anuleaza_rezervare.
//
// Default-enabled rule: a tenant must have BOTH a hepy_owner_bindings row
// AND reservation_settings.is_enabled = true. The first is implicit when
// auth.kind === 'owner'; the second is checked at the top of each handler
// and reported with a friendly "rezervările nu sunt activate" reply that
// tells the operator how to switch them on.
//
// Tenant locale: replies follow tenants.settings.default_locale ('en' →
// English; otherwise RO). Most installs are RO so the EN copy is opt-in.
//
// Rate limit: 3 successful bookings per Telegram user per rolling hour.
// Implemented by counting hepy_reservation_created audit_log rows in the
// past 60 min for the same telegram_user_id (read from
// hepy_owner_bindings). Cheap (< 5ms), no extra schema.

const RESERVATION_RATE_LIMIT_PER_HOUR = 3;

type Locale = 'ro' | 'en';

interface ReservationCopy {
  disabledShort: string;
  disabledLong: string;
  rateLimited: (n: number) => string;
  askDate: string;
  askTime: string;
  askPartySize: string;
  askPhone: string;
  askName: string;
  bookingFailed: (msg: string) => string;
  bookingOk: (token: string, when: string, party: number, name: string) => string;
  listEmpty: string;
  listHeader: string;
  cancelOk: (token: string) => string;
  cancelNotFound: string;
  cancelAlreadyCancelled: string;
  cancelInvalidToken: string;
  oneLinerHelp: string;
}

const RESERVATION_COPY: Record<Locale, ReservationCopy> = {
  ro: {
    disabledShort: 'Rezervările nu sunt activate pentru acest restaurant.',
    disabledLong:
      'Rezervările nu sunt activate. Activați-le din panoul de administrare:\n<i>Setări → Rezervări → Activează</i>.',
    rateLimited: (n) =>
      `Ați făcut ${n} rezervări în ultima oră prin Hepy. Vă rugăm să așteptați câteva minute înainte de a încerca din nou.`,
    askDate:
      'Pentru ce <b>dată</b>? (ex. <i>mâine</i>, <i>vineri</i>, <i>1 iunie</i>, <i>15.06</i>)',
    askTime:
      'La ce <b>oră</b>? (ex. <i>19:00</i>, <i>7 seara</i>, <i>ora 20</i>)',
    askPartySize: 'Pentru <b>câte persoane</b>?',
    askPhone:
      'Care este <b>numărul de telefon</b> al clientului? (ex. <code>0712345678</code>)',
    askName: 'Care este <b>numele</b> clientului?',
    bookingFailed: (msg) => `Nu am putut crea rezervarea: ${escapeHtml(msg)}`,
    bookingOk: (token, when, party, name) =>
      `Rezervare creată pentru <b>${escapeHtml(name)}</b>.\nData: <b>${escapeHtml(when)}</b>\nPersoane: <b>${party}</b>\nToken: <code>${escapeHtml(token)}</code>\n\nClientul va primi confirmarea pe email dacă a fost furnizat. Folosiți /rezervari pentru lista completă.`,
    listEmpty: 'Nicio rezervare în următoarele 14 zile.',
    listHeader: 'Rezervări — următoarele 14 zile',
    cancelOk: (token) =>
      `Rezervarea <code>${escapeHtml(token)}</code> a fost anulată.`,
    cancelNotFound:
      'Token invalid sau rezervarea nu există. Folosiți /rezervari pentru lista activă.',
    cancelAlreadyCancelled:
      'Această rezervare a fost deja anulată sau finalizată.',
    cancelInvalidToken:
      'Token invalid. Folosiți: <code>/anuleaza_rezervare &lt;token&gt;</code>',
    oneLinerHelp:
      'Exemple:\n· <code>/rezerva mâine 19:00, 4 persoane, telefon 0712345678, nume Iulian</code>\n· <code>/rezerva vineri ora 20, masa de 6, tel 0712345678, numele Andrei</code>\n\nSau scrieți doar <code>/rezerva</code> și vă voi întreba pas cu pas.',
  },
  en: {
    disabledShort: 'Reservations are not enabled for this restaurant.',
    disabledLong:
      'Reservations are not enabled. Turn them on from the admin panel:\n<i>Settings → Reservations → Enable</i>.',
    rateLimited: (n) =>
      `You created ${n} reservations via Hepy in the last hour. Please wait a few minutes before trying again.`,
    askDate:
      'What <b>date</b>? (e.g. <i>tomorrow</i>, <i>friday</i>, <i>june 1</i>, <i>15/06</i>)',
    askTime: 'What <b>time</b>? (e.g. <i>19:00</i>, <i>7pm</i>)',
    askPartySize: 'For <b>how many people</b>?',
    askPhone:
      'What is the customer\'s <b>phone number</b>? (e.g. <code>0712345678</code>)',
    askName: 'What is the customer\'s <b>name</b>?',
    bookingFailed: (msg) => `Could not create reservation: ${escapeHtml(msg)}`,
    bookingOk: (token, when, party, name) =>
      `Reservation created for <b>${escapeHtml(name)}</b>.\nWhen: <b>${escapeHtml(when)}</b>\nParty: <b>${party}</b>\nToken: <code>${escapeHtml(token)}</code>\n\nThe customer will receive a confirmation email if one was provided. Use /rezervari for the full list.`,
    listEmpty: 'No reservations in the next 14 days.',
    listHeader: 'Reservations — next 14 days',
    cancelOk: (token) =>
      `Reservation <code>${escapeHtml(token)}</code> has been cancelled.`,
    cancelNotFound:
      'Invalid token or the reservation does not exist. Use /rezervari to see the active list.',
    cancelAlreadyCancelled:
      'This reservation is already cancelled or completed.',
    cancelInvalidToken:
      'Invalid token. Usage: <code>/anuleaza_rezervare &lt;token&gt;</code>',
    oneLinerHelp:
      'Examples:\n· <code>/rezerva tomorrow 7pm, 4 people, phone 0712345678, name John</code>\n· <code>/rezerva friday at 8pm, table for 6, tel 0712345678, name Andrei</code>\n\nOr just type <code>/rezerva</code> and I will ask you step-by-step.',
  },
};

async function getTenantLocale(supabase: any, tenantId: string): Promise<Locale> {
  // The schema does not have a top-level tenants.default_locale column;
  // we read it from the tenants.settings JSONB if present, defaulting to
  // 'ro'. This is a soft-read — any failure falls back to RO.
  try {
    const { data } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();
    const loc = (data?.settings as { default_locale?: string } | null)?.default_locale;
    return loc === 'en' ? 'en' : 'ro';
  } catch (_e) {
    return 'ro';
  }
}

async function reservationsEnabled(
  supabase: any,
  tenantId: string,
): Promise<{ enabled: boolean; partySizeMax: number }> {
  const { data } = await supabase
    .from('reservation_settings')
    .select('is_enabled, party_size_max')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return {
    enabled: Boolean(data?.is_enabled),
    partySizeMax: Number(data?.party_size_max ?? 12),
  };
}

// Combine date (YYYY-MM-DD) + time (HH:MM) interpreted in Europe/Bucharest
// into a UTC ISO string. Bucharest is UTC+2 in winter and UTC+3 in DST
// (last Sunday of March → last Sunday of October). We use the standard
// DST rule rather than Intl since Deno's Intl is not stable for this.
function bucharestLocalToUtcIso(date: string, time: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(t[1]);
  const mm = Number(t[2]);

  // EU DST: last Sunday of March 03:00 local → last Sunday of October 04:00 local.
  function lastSundayUtc(year: number, monthIdx: number): Date {
    // Last day of month
    const last = new Date(Date.UTC(year, monthIdx + 1, 0));
    const lastDow = last.getUTCDay();
    const lastSundayDay = last.getUTCDate() - lastDow;
    return new Date(Date.UTC(year, monthIdx, lastSundayDay));
  }
  const dstStart = lastSundayUtc(y, 2); // March
  const dstEnd = lastSundayUtc(y, 9);   // October
  // Naive UTC of the local time
  const naiveUtc = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  const inDst = naiveUtc >= dstStart && naiveUtc < dstEnd;
  const offsetH = inDst ? 3 : 2;
  return new Date(naiveUtc.getTime() - offsetH * 3600 * 1000).toISOString();
}

function fmtBucharestForDisplay(iso: string): string {
  // Render YYYY-MM-DD HH:MM in Bucharest local time. Reuses the DST
  // calculation above to avoid pulling in Intl.
  const utc = new Date(iso);
  const y = utc.getUTCFullYear();
  function lastSundayUtc(year: number, monthIdx: number): Date {
    const last = new Date(Date.UTC(year, monthIdx + 1, 0));
    const lastDow = last.getUTCDay();
    return new Date(Date.UTC(year, monthIdx, last.getUTCDate() - lastDow));
  }
  const dstStart = lastSundayUtc(y, 2);
  const dstEnd = lastSundayUtc(y, 9);
  const inDst = utc >= dstStart && utc < dstEnd;
  const offsetH = inDst ? 3 : 2;
  const local = new Date(utc.getTime() + offsetH * 3600 * 1000);
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

async function checkReservationRateLimit(
  supabase: any,
  telegramUserId: number,
): Promise<{ ok: boolean; recentCount: number }> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('action', 'hepy_reservation_created')
    .eq('entity_type', 'hepy_reservation')
    .contains('metadata', { telegram_user_id: telegramUserId })
    .gte('created_at', since);
  const c = count ?? 0;
  return { ok: c < RESERVATION_RATE_LIMIT_PER_HOUR, recentCount: c };
}

type DraftField = 'date' | 'time' | 'party_size' | 'phone' | 'first_name';

interface DraftEnvelope {
  payload: ParsedReservation;
  next_field: DraftField | null;
}

async function loadConversationDraft(
  supabase: any,
  telegramUserId: number,
  tenantId: string,
  intent: string,
): Promise<ParsedReservation | null> {
  const env = await loadConversationDraftWithMeta(supabase, telegramUserId, tenantId, intent);
  return env?.payload ?? null;
}

async function loadConversationDraftWithMeta(
  supabase: any,
  telegramUserId: number,
  tenantId: string,
  intent: string,
): Promise<DraftEnvelope | null> {
  const { data } = await supabase
    .from('hepy_conversation_state')
    .select('payload, expires_at')
    .eq('telegram_user_id', telegramUserId)
    .eq('tenant_id', tenantId)
    .eq('intent', intent)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  // The payload jsonb stores the parsed-fields object plus a sidecar
  // `_next_field` key; this is internal to the bot and not surfaced
  // anywhere user-facing. Strip it before returning the typed payload.
  const raw = (data.payload ?? {}) as ParsedReservation & { _next_field?: DraftField | null };
  const { _next_field, ...payload } = raw;
  return { payload: payload as ParsedReservation, next_field: _next_field ?? null };
}

async function saveConversationDraft(
  supabase: any,
  telegramUserId: number,
  tenantId: string,
  intent: string,
  payload: ParsedReservation,
  nextField: DraftField | null = null,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await supabase
    .from('hepy_conversation_state')
    .upsert(
      {
        telegram_user_id: telegramUserId,
        tenant_id: tenantId,
        intent,
        payload: { ...payload, _next_field: nextField },
        updated_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'telegram_user_id,tenant_id,intent' },
    );
}

// Interpret a bare reply (just "4" or just "Iulian") as the answer to
// the field we last asked about. Returns the merged draft. If the bare
// reply does not parse for that field, the draft is returned unchanged
// so tryCommitReservation will re-ask. We deliberately only fill the
// SINGLE field we asked about so e.g. "4" while expecting a phone is
// not silently misclassified as the party size.
function applyBareAnswer(
  merged: ParsedReservation,
  raw: string,
  nextField: DraftField | null,
): ParsedReservation {
  if (!nextField) return merged;
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return merged;
  const out: ParsedReservation = { ...merged };

  switch (nextField) {
    case 'party_size': {
      if (out.party_size != null) break;
      const m = trimmed.match(/^\s*(\d{1,3})\s*$/);
      if (m) {
        const n = Number(m[1]);
        if (n >= 1 && n <= 100) out.party_size = n;
      }
      break;
    }
    case 'phone': {
      if (out.phone != null) break;
      const digits = trimmed.replace(/[^\d+]/g, '');
      // Mirror the parser's normalisation rules: 7-15 digits, leading
      // '+' preserved.
      const hasPlus = digits.startsWith('+');
      const onlyDigits = digits.replace(/[^\d]/g, '');
      if (onlyDigits.length >= 7 && onlyDigits.length <= 15) {
        out.phone = hasPlus ? '+' + onlyDigits : onlyDigits;
      }
      break;
    }
    case 'first_name': {
      if (out.first_name != null) break;
      // Accept any short non-empty single line. Strip trailing punctuation.
      const cleaned = trimmed.replace(/[.,;:!?]+$/, '').trim();
      if (cleaned.length >= 1 && cleaned.length <= 80) {
        out.first_name = cleaned;
      }
      break;
    }
    case 'time': {
      // Codex P2 (round 5): a very common dialog reply for the time
      // question is just a bare hour ("20") or compact "1900". The
      // parser's regexes require "19:00" / "ora 20" / "7 seara", so
      // those bare replies would re-trigger the same question.
      if (out.time != null) break;
      let mTime = trimmed.match(/^\s*(\d{1,2})\s*$/);
      if (mTime) {
        const h = Number(mTime[1]);
        if (h >= 0 && h <= 23) {
          out.time = (h < 10 ? '0' + h : String(h)) + ':00';
          break;
        }
      }
      // "1900" → 19:00 (3-4 digit compact form).
      mTime = trimmed.match(/^\s*(\d{1,2})(\d{2})\s*$/);
      if (mTime) {
        const h = Number(mTime[1]);
        const min = Number(mTime[2]);
        if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
          out.time = (h < 10 ? '0' + h : String(h)) + ':' + (min < 10 ? '0' + min : String(min));
        }
      }
      break;
    }
    case 'date':
      // The parser already covers all the natural-language forms for
      // dates ("mâine", "vineri", "1 iunie", "15.06"), so a bare-answer
      // reply that isn't already handled by the parser would itself be
      // ambiguous (e.g. "5" — is that the day, or did the operator
      // intend it as a number?). We let the dialog re-ask in that case.
      break;
  }
  return out;
}

// Map "missing fields" → the single next field we will ask about. Used
// both when persisting the draft (so the next message can be interpreted
// in context) and when the dialog continues.
function nextFieldFor(draft: ParsedReservation): DraftField | null {
  const m = missingFields(draft);
  if (m.includes('date')) return 'date';
  if (m.includes('time')) return 'time';
  if (m.includes('party_size')) return 'party_size';
  if (m.includes('phone')) return 'phone';
  if (m.includes('first_name')) return 'first_name';
  return null;
}

async function clearConversationDraft(
  supabase: any,
  telegramUserId: number,
  tenantId: string,
  intent: string,
): Promise<void> {
  await supabase
    .from('hepy_conversation_state')
    .delete()
    .eq('telegram_user_id', telegramUserId)
    .eq('tenant_id', tenantId)
    .eq('intent', intent);
}

// Try to commit the booking with the current parsed state. Returns either
// a success message (booking row inserted) or an "ask next field" message
// if the draft is incomplete. Caller is responsible for the audit-log row
// on success and for clearing the draft when done.
async function tryCommitReservation(
  supabase: any,
  tenantId: string,
  partySizeMax: number,
  draft: ParsedReservation,
  copy: ReservationCopy,
): Promise<
  | { kind: 'ok'; tokenShort: string; whenLocal: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'incomplete'; nextAsk: string }
> {
  const missing = missingFields(draft);
  if (missing.includes('date')) return { kind: 'incomplete', nextAsk: copy.askDate };
  if (missing.includes('time')) return { kind: 'incomplete', nextAsk: copy.askTime };
  if (missing.includes('party_size')) return { kind: 'incomplete', nextAsk: copy.askPartySize };
  if (missing.includes('phone')) return { kind: 'incomplete', nextAsk: copy.askPhone };
  if (missing.includes('first_name')) return { kind: 'incomplete', nextAsk: copy.askName };

  // Light client-side validation that mirrors fn_reservation_request guards.
  // The RPC is the authoritative gate, but we fail fast here for the common
  // user errors (bad time format, party_size cap).
  if (!draft.party_size || draft.party_size < 1 || draft.party_size > partySizeMax) {
    return {
      kind: 'rejected',
      message: `Pentru un grup mai mare de ${partySizeMax} sunați direct restaurantul.`,
    };
  }

  const isoUtc = bucharestLocalToUtcIso(draft.date!, draft.time!);
  if (!isoUtc) {
    return { kind: 'rejected', message: 'Data sau ora nu pot fi interpretate.' };
  }

  const { data: rpcResult, error } = await supabase.rpc('fn_reservation_request', {
    p_tenant_id: tenantId,
    p_first_name: draft.first_name!,
    p_phone: draft.phone!,
    p_email: null,
    p_party_size: draft.party_size,
    p_requested_at: isoUtc,
    p_notes: 'Creată prin Hepy Telegram',
    p_table_id: null,
  });
  if (error) {
    return { kind: 'rejected', message: 'Eroare temporară. Reîncercați.' };
  }
  const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  if (!row || row.status === 'REJECTED') {
    return { kind: 'rejected', message: row?.message ?? 'Rezervarea nu a putut fi acceptată.' };
  }

  return {
    kind: 'ok',
    tokenShort: String(row.public_track_token).slice(0, 8),
    whenLocal: fmtBucharestForDisplay(isoUtc),
  };
}

async function handleReservaCommand(
  supabase: any,
  tenant: { tenant_id: string; name: string },
  telegramUserId: number,
  args: string,
): Promise<{ text: string; status: string }> {
  const locale = await getTenantLocale(supabase, tenant.tenant_id);
  const copy = RESERVATION_COPY[locale];

  const settings = await reservationsEnabled(supabase, tenant.tenant_id);
  if (!settings.enabled) {
    return {
      text: `<b>📅 ${escapeHtml(tenant.name)}</b>\n${copy.disabledLong}`,
      status: 'RESERVATION_DISABLED',
    };
  }

  // Rate limit BEFORE we burn any work.
  const rl = await checkReservationRateLimit(supabase, telegramUserId);
  if (!rl.ok) {
    return { text: copy.rateLimited(rl.recentCount), status: 'RATE_LIMITED' };
  }

  // Merge any prior draft with the new fields parsed from this message.
  // We also load the prior "next_field" hint so we can interpret bare
  // answers (e.g. "4" while the bot is asking the party size, or
  // "Iulian" while it's asking the customer name) — the rule-based
  // parser otherwise needs explicit keywords ("4 persoane", "nume Iulian").
  const priorRow = await loadConversationDraftWithMeta(
    supabase,
    telegramUserId,
    tenant.tenant_id,
    'reserva',
  );
  const prior = priorRow?.payload ?? null;
  const fresh = parseReservation(args ?? '');
  const merged: ParsedReservation = {
    date: fresh.date ?? prior?.date ?? null,
    time: fresh.time ?? prior?.time ?? null,
    party_size: fresh.party_size ?? prior?.party_size ?? null,
    phone: fresh.phone ?? prior?.phone ?? null,
    first_name: fresh.first_name ?? prior?.first_name ?? null,
    notes: fresh.notes ?? prior?.notes ?? null,
  };

  // Codex P2 (re-review on 9e50997): if the parser left a field null and
  // we previously asked for that exact field, try to interpret the raw
  // reply as a bare answer. Order mirrors the question order in
  // tryCommitReservation so we never misclassify (e.g. "4" while we
  // were asking the date is rejected).
  const draft: ParsedReservation = applyBareAnswer(merged, args ?? '', priorRow?.next_field ?? null);

  // If the operator typed bare `/rezerva` with NO prior draft AND no args,
  // show the help block before starting the dialog. Avoids surprising
  // the user with an immediate "what date?" question.
  //
  // Codex P2: we MUST persist the empty draft here, otherwise the
  // non-slash continuation path (which is gated on
  // loadConversationDraft() returning a row) will never route the user's
  // first reply ("mâine") back into the booking flow — the reply would
  // fall through to the regex intent classifier, get NONE, and the user
  // would receive the generic "Hepy nu a înțeles" reply instead.
  if (!prior && !args.trim()) {
    await saveConversationDraft(
      supabase,
      telegramUserId,
      tenant.tenant_id,
      'reserva',
      draft,
      'date',
    );
    return {
      text: `<b>📅 ${escapeHtml(tenant.name)} — rezervare nouă</b>\n${copy.oneLinerHelp}\n\n${copy.askDate}`,
      status: 'RESERVATION_DIALOG_START',
    };
  }

  const result = await tryCommitReservation(
    supabase,
    tenant.tenant_id,
    settings.partySizeMax,
    draft,
    copy,
  );

  if (result.kind === 'incomplete') {
    await saveConversationDraft(
      supabase,
      telegramUserId,
      tenant.tenant_id,
      'reserva',
      draft,
      nextFieldFor(draft),
    );
    return { text: result.nextAsk, status: 'RESERVATION_INCOMPLETE' };
  }

  if (result.kind === 'rejected') {
    // Keep the draft so the user can retry without losing fields. Don't
    // overwrite next_field — the user already saw a question; if they
    // come back with a one-liner the merge path handles it.
    await saveConversationDraft(
      supabase,
      telegramUserId,
      tenant.tenant_id,
      'reserva',
      draft,
      nextFieldFor(draft),
    );
    return { text: copy.bookingFailed(result.message), status: 'RESERVATION_REJECTED' };
  }

  await clearConversationDraft(supabase, telegramUserId, tenant.tenant_id, 'reserva');

  // Audit
  try {
    await supabase.from('audit_log').insert({
      tenant_id: tenant.tenant_id,
      action: 'hepy_reservation_created',
      entity_type: 'hepy_reservation',
      entity_id: result.tokenShort,
      metadata: {
        telegram_user_id: telegramUserId,
        party_size: draft.party_size,
        when: result.whenLocal,
        first_name: draft.first_name,
        phone_suffix: draft.phone?.slice(-4) ?? null,
      },
    });
  } catch (e) {
    console.warn('hepy_reservation_created audit fail', (e as Error)?.message);
  }

  return {
    text: copy.bookingOk(
      result.tokenShort,
      result.whenLocal,
      draft.party_size!,
      draft.first_name!,
    ),
    status: 'RESERVATION_OK',
  };
}

async function handleRezervariList(
  supabase: any,
  tenant: { tenant_id: string; name: string },
): Promise<{ text: string; status: string }> {
  const locale = await getTenantLocale(supabase, tenant.tenant_id);
  const copy = RESERVATION_COPY[locale];

  const settings = await reservationsEnabled(supabase, tenant.tenant_id);
  if (!settings.enabled) {
    return {
      text: `<b>📅 ${escapeHtml(tenant.name)}</b>\n${copy.disabledShort}`,
      status: 'RESERVATION_DISABLED',
    };
  }

  const now = new Date().toISOString();
  const in14d = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  const { data: rows } = await supabase
    .from('reservations')
    .select('public_track_token, customer_first_name, customer_phone, party_size, requested_at, status, notes')
    .eq('tenant_id', tenant.tenant_id)
    .in('status', ['REQUESTED', 'CONFIRMED'])
    .gte('requested_at', now)
    .lte('requested_at', in14d)
    .order('requested_at', { ascending: true })
    .limit(20);

  try {
    await supabase.from('audit_log').insert({
      tenant_id: tenant.tenant_id,
      action: 'hepy_reservation_listed',
      entity_type: 'hepy_reservation',
      entity_id: 'list',
      metadata: { returned: rows?.length ?? 0 },
    });
  } catch (_e) {
    // best-effort
  }

  if (!rows || rows.length === 0) {
    return {
      text: `<b>📅 ${escapeHtml(tenant.name)} — ${escapeHtml(copy.listHeader)}</b>\n${copy.listEmpty}`,
      status: 'OK',
    };
  }

  const lines = [`<b>📅 ${escapeHtml(tenant.name)} — ${escapeHtml(copy.listHeader)}</b>`];
  for (const r of rows) {
    const when = fmtBucharestForDisplay(r.requested_at);
    const tok = String(r.public_track_token).slice(0, 8);
    const flag = r.status === 'CONFIRMED' ? '✅' : '⏳';
    lines.push(
      `${flag} <code>${escapeHtml(tok)}</code> · ${escapeHtml(when)} · ${r.party_size} pers · ${escapeHtml(r.customer_first_name)}`,
    );
  }
  lines.push(`\n<i>Anulează: <code>/anuleaza_rezervare &lt;token&gt;</code></i>`);
  return { text: lines.join('\n').slice(0, 4000), status: 'OK' };
}

async function handleAnuleazaRezervare(
  supabase: any,
  tenant: { tenant_id: string; name: string },
  telegramUserId: number,
  args: string,
): Promise<{ text: string; status: string }> {
  const locale = await getTenantLocale(supabase, tenant.tenant_id);
  const copy = RESERVATION_COPY[locale];

  // Codex P2: stay consistent with /rezerva and /rezervari — if the
  // tenant has reservations turned off, refuse the cancel request too.
  // Otherwise an OWNER could still mutate reservation rows for a feature
  // that the documentation says is disabled, which violates the
  // default-enabled rule for the reservation write intents.
  const settings = await reservationsEnabled(supabase, tenant.tenant_id);
  if (!settings.enabled) {
    return {
      text: `<b>📅 ${escapeHtml(tenant.name)}</b>\n${copy.disabledShort}`,
      status: 'RESERVATION_DISABLED',
    };
  }

  const tokenArg = args.trim().toLowerCase();
  // Accept either an 8-hex prefix or a full uuid. Block anything else.
  if (!/^[0-9a-f]{8,}(-[0-9a-f]+)*$/.test(tokenArg)) {
    return { text: copy.cancelInvalidToken, status: 'ERR' };
  }

  // Codex P2 (re-review on 9e50997): PostgREST does not support a cast
  // in a horizontal `ilike` filter ("public_track_token::text" → 400).
  // Instead, fetch the cancellable reservations (REQUESTED/CONFIRMED
  // only) for the tenant and prefix-match in app code. RLS + the
  // tenant_id filter ensure cross-tenant isolation.
  //
  // Codex P2 (round 6): scope the query by status (the only rows that
  // can be cancelled) instead of a recency window + 200-row page —
  // those filters could exclude a far-future booking on a high-volume
  // tenant. Restricting to ACTIVE statuses keeps the result set small
  // enough that the 1000-row PostgREST default limit is sufficient
  // headroom (typical tenant: 5-50 active reservations).
  const { data: rowsRaw } = await supabase
    .from('reservations')
    .select('id, public_track_token, status')
    .eq('tenant_id', tenant.tenant_id)
    .in('status', ['REQUESTED', 'CONFIRMED']);
  const matches = ((rowsRaw ?? []) as Array<{ id: string; public_track_token: string; status: string }>)
    .filter((r) => String(r.public_track_token).toLowerCase().startsWith(tokenArg));
  if (matches.length === 0) {
    // Fallback probe (small, status != active): check whether the token
    // matches a recently terminated reservation so we can return the
    // friendlier "already cancelled" message instead of a generic
    // "not found". Bounded by recency to keep the page small.
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: terminatedRaw } = await supabase
      .from('reservations')
      .select('public_track_token, status')
      .eq('tenant_id', tenant.tenant_id)
      .in('status', ['CANCELLED', 'COMPLETED', 'NOSHOW', 'REJECTED'])
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(200);
    const terminated = ((terminatedRaw ?? []) as Array<{ public_track_token: string; status: string }>)
      .find((r) => String(r.public_track_token).toLowerCase().startsWith(tokenArg));
    if (terminated) {
      return { text: copy.cancelAlreadyCancelled, status: 'NOOP' };
    }
    return { text: copy.cancelNotFound, status: 'NOT_FOUND' };
  }
  if (matches.length > 1) {
    return {
      text: 'Token ambiguu — folosiți un prefix mai lung (cel puțin 12 caractere).',
      status: 'AMBIGUOUS',
    };
  }
  const r = matches[0];

  const { error: updErr } = await supabase
    .from('reservations')
    .update({ status: 'CANCELLED', rejection_reason: 'Anulată prin Hepy Telegram' })
    .eq('id', r.id);
  if (updErr) {
    return { text: 'Eroare temporară. Reîncercați.', status: 'ERR' };
  }

  try {
    await supabase.from('audit_log').insert({
      tenant_id: tenant.tenant_id,
      action: 'hepy_reservation_cancelled',
      entity_type: 'hepy_reservation',
      entity_id: r.id,
      metadata: {
        telegram_user_id: telegramUserId,
        token_prefix: String(r.public_track_token).slice(0, 8),
      },
    });
  } catch (_e) {
    // best-effort
  }

  return {
    text: copy.cancelOk(String(r.public_track_token).slice(0, 8)),
    status: 'OK',
  };
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

Rezervări:
/rezerva — rezervare nouă (vă voi întreba pas cu pas, sau scrieți totul într-un mesaj)
/rezervari — următoarele 14 zile
/anuleaza_rezervare &lt;token&gt; — anulează după token

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
  // Hepy reservation booking — OWNER-only write intents. Operator
  // (Iulian) can also use them after /tenant <slug> for testing.
  // ────────────────────────────────────────────────────────────
  if (cmd === '/rezerva' || cmd === '/rezervari' || cmd === '/anuleaza_rezervare') {
    const tenant = await getActiveTenant(supabase, chatId, auth);
    if (!tenant) return { text: TENANT_HINT, status: 'NEEDS_TENANT' };
    if (cmd === '/rezerva') return await handleReservaCommand(supabase, tenant, chatId, args);
    if (cmd === '/rezervari') return await handleRezervariList(supabase, tenant);
    return await handleAnuleazaRezervare(supabase, tenant, chatId, args);
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
      // 0) Reservation dialog continuation. If the user has an active
      //    /rezerva draft for the bound tenant (TTL 10 min), interpret
      //    this free-text message as the answer to the question we just
      //    asked. We dispatch through handleReservaCommand which merges
      //    the new fields with the saved draft and either commits or
      //    asks the next question.
      const tenantForDraft = await getActiveTenant(supabase, chatId, auth);
      if (tenantForDraft) {
        const draft = await loadConversationDraft(supabase, chatId, tenantForDraft.tenant_id, 'reserva');
        if (draft) {
          const r = await handleReservaCommand(supabase, tenantForDraft, chatId, trimmed);
          await tgSend(tgToken, chatId, r.text, msg.message_id);
          setMetadata({ hepy: true, intent: 'rezerva:continue', role: auth?.kind ?? 'anon' });
          EdgeRuntime.waitUntil(logCommand(supabase, {
            chat_id: chatId, message_id: msg.message_id, username: tgUsername,
            command: 'hepy:rezerva', args: trimmed.slice(0, 200), result_summary: r.text.slice(0, 200),
            status: r.status, duration_ms: Date.now() - start,
          }));
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

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
    if (cmd === '/tenant' || cmd === '/comenzi' || cmd === '/vanzari' || cmd === '/stoc' || cmd === '/rezerva' || cmd === '/rezervari' || cmd === '/anuleaza_rezervare' || (cmd === '/help' && args.trim().toLowerCase() === 'hepy') || (cmd === '/status' && args.trim().toLowerCase() === 'hepy')) {
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
