// HIR AI CEO — Daily Brief Edge Function (MVP).
//
// Triggered hourly by pg_cron. For each tenant with an active brief
// schedule whose `delivery_hour_local` matches the current Bucharest
// hour, builds a 3-suggestion brief from last-7-day order metrics and
// posts it to the tenant's Telegram thread.
//
// MVP scope: deterministic suggestion templates (no AI generation yet).
// Phase 2 will swap the templates for `run-agent` Asistent calls.
//
// Approval flow: v1 ships text-only. Operator replies "👍 1" or
// "Aprobă 2" in Telegram; the existing telegram-bot's intent router
// handles the natural-language reply via the Asistent agent. We don't
// add inline-keyboard buttons in this PR because the callback handler
// lives in WIP code that hasn't merged yet.
//
// Auth: shared-secret header `x-hir-notify-secret` (matching every
// other HIR notify-style function).
//
// Required env (Supabase function secrets):
//   HIR_NOTIFY_SECRET, TELEGRAM_BOT_TOKEN
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const TELEGRAM_API = 'https://api.telegram.org';

// Bucharest is UTC+2 (winter) or UTC+3 (summer). For MVP we use the
// fixed UTC+3 (current April 2026 = DST), since the brief runs at a
// single time of day where ±1h doesn't materially matter. A future
// improvement: use Intl.DateTimeFormat with the timezone.
function bucharestHour(): number {
  return (new Date().getUTCHours() + 3) % 24;
}

type Thread = {
  restaurant_id: string;
  telegram_chat_id: number;
  title: string | null;
};

type Schedule = {
  tenant_id: string;
  enabled: boolean;
  delivery_hour_local: number;
  last_sent_at: string | null;
  consecutive_skips: number;
};

type WeeklyMetrics = {
  totalOrders: number;
  totalRevenue: number;
  topItem: { name: string; count: number } | null;
  worstHour: { hour: number; count: number } | null;
  pendingCod: number;
  // Items whose 7-day count dropped >20% vs the prior 7-day window.
  slumpItems: Array<{ name: string; current: number; prior: number; deltaPct: number }>;
};

type Suggestion = {
  id: string;
  type: 'promo' | 'menu_insight' | 'customer_outreach';
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

async function getActiveSchedules(
  supabase: SupabaseClient,
  hour: number,
): Promise<Array<Schedule & Thread>> {
  // Join schedules + threads in one round-trip so the function only
  // pings rows it can actually message.
  const { data, error } = await supabase
    .from('copilot_brief_schedules')
    .select(
      'tenant_id, enabled, delivery_hour_local, last_sent_at, consecutive_skips, copilot_threads!inner(restaurant_id, telegram_chat_id, title)',
    )
    .eq('enabled', true)
    .eq('delivery_hour_local', hour)
    .lt('consecutive_skips', 3); // self-pause after 3 unseen briefs
  if (error) {
    console.error('[daily-brief] schedule lookup error:', error.message);
    return [];
  }
  // Flatten the join.
  return (data ?? []).map((row: Record<string, unknown>) => {
    const t = (row.copilot_threads as Record<string, unknown>) ?? {};
    return {
      tenant_id: row.tenant_id as string,
      enabled: row.enabled as boolean,
      delivery_hour_local: row.delivery_hour_local as number,
      last_sent_at: row.last_sent_at as string | null,
      consecutive_skips: row.consecutive_skips as number,
      restaurant_id: t.restaurant_id as string,
      telegram_chat_id: t.telegram_chat_id as number,
      title: t.title as string | null,
    };
  });
}

async function fetchWeeklyMetrics(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<WeeklyMetrics> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400 * 1000).toISOString();

  // Last-7-day orders, recent window
  const { data: recent } = await supabase
    .from('restaurant_orders')
    .select('id, total_ron, items, payment_method, payment_status, status, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', weekAgo)
    .neq('status', 'CANCELLED');
  const recentRows = (recent ?? []) as Array<{
    id: string;
    total_ron: number | string | null;
    items: unknown;
    payment_method: string | null;
    payment_status: string | null;
    status: string | null;
    created_at: string;
  }>;

  // Prior 7-day window (for delta calc)
  const { data: prior } = await supabase
    .from('restaurant_orders')
    .select('id, items')
    .eq('tenant_id', tenantId)
    .gte('created_at', twoWeeksAgo)
    .lt('created_at', weekAgo)
    .neq('status', 'CANCELLED');
  const priorRows = (prior ?? []) as Array<{ id: string; items: unknown }>;

  // Aggregate item counts in each window
  function countItems(rows: Array<{ items: unknown }>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (!Array.isArray(r.items)) continue;
      for (const li of r.items as Array<{ name?: string; quantity?: number }>) {
        const name = (li?.name ?? '').toString().trim();
        if (!name) continue;
        const qty = Number(li?.quantity ?? 1) || 1;
        counts[name] = (counts[name] ?? 0) + qty;
      }
    }
    return counts;
  }
  const recentCounts = countItems(recentRows);
  const priorCounts = countItems(priorRows);

  // Top item
  let topItem: { name: string; count: number } | null = null;
  for (const [name, count] of Object.entries(recentCounts)) {
    if (!topItem || count > topItem.count) topItem = { name, count };
  }

  // Worst hour: hour-of-day with the lowest order count this week
  const hourCounts: number[] = new Array(24).fill(0);
  for (const r of recentRows) {
    const h = (new Date(r.created_at).getUTCHours() + 3) % 24;
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  let worstHour: { hour: number; count: number } | null = null;
  // Restrict to "active" hours (10-23) so we don't flag 4 AM as "worst"
  for (let h = 10; h <= 23; h++) {
    if (worstHour === null || hourCounts[h] < worstHour.count) {
      worstHour = { hour: h, count: hourCounts[h] };
    }
  }

  // Slump items: drop >=20% vs prior week (only items that had >=3 sales prior)
  const slumpItems: WeeklyMetrics['slumpItems'] = [];
  for (const [name, prev] of Object.entries(priorCounts)) {
    if (prev < 3) continue;
    const curr = recentCounts[name] ?? 0;
    const delta = (curr - prev) / prev;
    if (delta <= -0.2) {
      slumpItems.push({ name, current: curr, prior: prev, deltaPct: Math.round(delta * 100) });
    }
  }
  slumpItems.sort((a, b) => a.deltaPct - b.deltaPct);

  // Pending COD orders (paid_status UNPAID + payment_method COD + status DELIVERED) — operator owes money to courier
  const pendingCod = recentRows.filter(
    (r) => r.payment_method === 'COD' && r.payment_status === 'UNPAID' && r.status === 'DELIVERED',
  ).length;

  const totalRevenue = recentRows.reduce(
    (s, r) => s + (Number(r.total_ron) || 0),
    0,
  );

  return {
    totalOrders: recentRows.length,
    totalRevenue: Math.round(totalRevenue),
    topItem,
    worstHour,
    pendingCod,
    slumpItems: slumpItems.slice(0, 3),
  };
}

function buildSuggestions(m: WeeklyMetrics): Suggestion[] {
  const out: Suggestion[] = [];

  // 1. Slump → promo
  if (m.slumpItems.length > 0) {
    const it = m.slumpItems[0];
    out.push({
      id: `s-promo-${Date.now()}-1`,
      type: 'promo',
      title: `📉 ${it.name} a scăzut ${Math.abs(it.deltaPct)}% săptămâna asta`,
      body: `Ultima săptămână: ${it.current} vs ${it.prior} acum 14 zile.\nVrei să creez un cod promo "−15% la ${it.name}" valabil 7 zile? Răspunde "👍 1" pentru aprobare.`,
      payload: {
        action: 'create_promo',
        item_name: it.name,
        discount_pct: 15,
        valid_days: 7,
      },
    });
  } else if (m.worstHour && m.worstHour.count <= 1) {
    out.push({
      id: `s-promo-${Date.now()}-1`,
      type: 'promo',
      title: `🌙 Ora ${m.worstHour.hour}:00 e moartă`,
      body: `Ai avut ${m.worstHour.count} comandă/comenzi la ora ${m.worstHour.hour} săptămâna asta.\nVrei "Happy hour: −20% între ${m.worstHour.hour}:00-${(m.worstHour.hour + 2) % 24}:00"? Răspunde "👍 1".`,
      payload: {
        action: 'create_promo',
        time_window: [m.worstHour.hour, (m.worstHour.hour + 2) % 24],
        discount_pct: 20,
      },
    });
  } else {
    out.push({
      id: `s-promo-${Date.now()}-1`,
      type: 'promo',
      title: `🎉 Săptămână bună: ${m.totalOrders} comenzi`,
      body: `Vrei să trimit cod "Mulțumim 10%" la primii 50 clienți pentru fidelizare? Răspunde "👍 1".`,
      payload: { action: 'send_email_blast', segment: 'recent_50', discount_pct: 10 },
    });
  }

  // 2. Menu insight
  if (m.topItem) {
    out.push({
      id: `s-insight-${Date.now()}-2`,
      type: 'menu_insight',
      title: `🔥 ${m.topItem.name} e star-ul săptămânii`,
      body: `${m.topItem.count} bucăți vândute în 7 zile.\nVrei să-l promovez ca "Bestseller" pe storefront (badge 🔥)? Răspunde "👍 2".`,
      payload: { action: 'mark_bestseller', item_name: m.topItem.name },
    });
  } else {
    out.push({
      id: `s-insight-${Date.now()}-2`,
      type: 'menu_insight',
      title: `📊 Niciun bestseller clar`,
      body: `Săptămâna asta nu am văzut un item dominant. Vrei să-ți construiesc un "Set Special" combinând top 3 ingrediente populare? Răspunde "👍 2".`,
      payload: { action: 'suggest_combo' },
    });
  }

  // 3. Customer outreach
  if (m.pendingCod >= 3) {
    out.push({
      id: `s-outreach-${Date.now()}-3`,
      type: 'customer_outreach',
      title: `💰 ${m.pendingCod} comenzi COD neîncasate`,
      body: `Vrei un raport detaliat cu adresa + telefon + sumă pentru fiecare? Răspunde "👍 3".`,
      payload: { action: 'cod_report' },
    });
  } else {
    out.push({
      id: `s-outreach-${Date.now()}-3`,
      type: 'customer_outreach',
      title: `📧 Reactivăm clienți inactivi`,
      body: `Pot trimite email cu cod 12% celor care nu au mai comandat de 21+ zile (estimare: ~30 emails). Răspunde "👍 3".`,
      payload: { action: 'send_winback_blast', inactive_days: 21, discount_pct: 12 },
    });
  }

  return out;
}

function formatBriefMessage(
  tenantTitle: string,
  m: WeeklyMetrics,
  s: Suggestion[],
): string {
  const lines: string[] = [];
  lines.push(`<b>🤖 Brief AI CEO — ${tenantTitle}</b>`);
  lines.push('');
  lines.push(
    `<b>Săptămâna trecută:</b> ${m.totalOrders} comenzi · ${m.totalRevenue} RON` +
      (m.topItem ? ` · top: <i>${m.topItem.name}</i>` : ''),
  );
  lines.push('');
  lines.push('<b>3 sugestii pentru azi:</b>');
  lines.push('');
  s.forEach((sug, i) => {
    lines.push(`${i + 1}️⃣ ${sug.title}`);
    lines.push(sug.body);
    lines.push('');
  });
  lines.push(
    `<i>Răspunde "👍 1", "👍 2", "👍 3" pentru a aproba o sugestie. Răspunde liber pentru a discuta cu Asistentul.</i>`,
  );
  return lines.join('\n');
}

async function postToTelegram(
  botToken: string,
  chatId: number,
  text: string,
): Promise<boolean> {
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error('[daily-brief] telegram error', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[daily-brief] telegram fetch failed:', (e as Error).message);
    return false;
  }
}

async function logRun(
  supabase: SupabaseClient,
  tenantId: string,
  agentId: string | null,
  suggestions: Suggestion[],
  metrics: WeeklyMetrics,
  delivered: boolean,
): Promise<void> {
  const { error } = await supabase.from('copilot_agent_runs').insert({
    restaurant_id: tenantId,
    agent_id: agentId,
    metadata: {
      kind: 'daily_brief',
      suggestions: suggestions.map((s) => ({ id: s.id, type: s.type, title: s.title, payload: s.payload })),
      metrics,
      delivered,
    },
    suggestion_status: suggestions.map(() => 'pending'),
  } as never);
  if (error) console.error('[daily-brief] log error:', error.message);
}

async function getAsistentAgentId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('copilot_agents')
    .select('id')
    .eq('name', 'Asistent')
    .eq('status', 'ACTIVE')
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
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

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });
  if (!BOT_TOKEN) return json(500, { error: 'telegram_token_missing' });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Allow `?force_hour=N` for manual triggering during testing
  const url = new URL(req.url);
  const forceHourParam = url.searchParams.get('force_hour');
  const hour = forceHourParam !== null ? Number(forceHourParam) : bucharestHour();
  console.log('[daily-brief] running for hour', hour);

  const schedules = await getActiveSchedules(supabase, hour);
  console.log(`[daily-brief] ${schedules.length} schedule(s) match hour ${hour}`);

  const agentId = await getAsistentAgentId(supabase);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const s of schedules) {
    if (!s.telegram_chat_id) {
      skipped += 1;
      continue;
    }
    try {
      const m = await fetchWeeklyMetrics(supabase, s.tenant_id);
      // Skip empty-week tenants — sending "0 comenzi" is depressing and useless.
      if (m.totalOrders === 0) {
        skipped += 1;
        await supabase
          .from('copilot_brief_schedules')
          .update({ consecutive_skips: s.consecutive_skips + 1, updated_at: new Date().toISOString() })
          .eq('tenant_id', s.tenant_id);
        continue;
      }
      const suggestions = buildSuggestions(m);
      const text = formatBriefMessage(s.title || 'Restaurant', m, suggestions);
      const ok = await postToTelegram(BOT_TOKEN, s.telegram_chat_id, text);
      await logRun(supabase, s.tenant_id, agentId, suggestions, m, ok);

      if (ok) {
        sent += 1;
        await supabase
          .from('copilot_brief_schedules')
          .update({
            last_sent_at: new Date().toISOString(),
            consecutive_skips: 0, // reset on successful send
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', s.tenant_id);
      } else {
        failed += 1;
      }
    } catch (e) {
      console.error('[daily-brief] tenant error', s.tenant_id, (e as Error).message);
      failed += 1;
    }
  }

  console.log(`[daily-brief] sent=${sent} skipped=${skipped} failed=${failed}`);
  return json(200, { hour, scheduled: schedules.length, sent, skipped, failed });
});
