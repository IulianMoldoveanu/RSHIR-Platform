// Health Monitor — pings the 3 production healthz endpoints and pings
// Hepi via Telegram on any non-200 or slow response. Triggered every 5 min
// from .github/workflows/health-monitor.yml using HEALTH_MONITOR_TOKEN.
//
// Endpoints monitored:
//   - https://hir-restaurant-web.vercel.app/api/healthz
//   - https://hir-restaurant-admin.vercel.app/api/healthz
//   - https://courier-beta-seven.vercel.app/api/healthz
//
// State: stored in `health_monitor_state` table (one row per app, last_status).
// Only alerts on STATE TRANSITION (ok -> fail or fail -> recovered) to avoid
// spam every 5 min while incident is open.

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
// Use the same env-var name as the rest of the platform (supervise-fix /
// fix-attempt / triage-feedback all read TELEGRAM_IULIAN_CHAT_ID from the
// Supabase secrets vault). Fall back to TELEGRAM_CHAT_ID for portability.
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID') ?? Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const HEALTH_MONITOR_TOKEN = Deno.env.get('HEALTH_MONITOR_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const ENDPOINTS = [
  { app: 'restaurant-web', url: 'https://hir-restaurant-web.vercel.app/api/healthz' },
  { app: 'restaurant-admin', url: 'https://hir-restaurant-admin.vercel.app/api/healthz' },
  { app: 'restaurant-courier', url: 'https://courier-beta-seven.vercel.app/api/healthz' },
];

const TIMEOUT_MS = 10_000;

type ProbeResult = {
  app: string;
  url: string;
  ok: boolean;
  status: number | null;
  latencyMs: number;
  detail: string | null;
  body: unknown;
};

async function probe(app: string, url: string): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'hir-health-monitor/1.0' } });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignore */ }
    const okFlag = (body as { ok?: boolean } | null)?.ok === true;
    return {
      app, url,
      ok: res.status === 200 && okFlag,
      status: res.status,
      latencyMs,
      detail: res.status === 200 && okFlag ? null : `status=${res.status} ok=${okFlag}`,
      body,
    };
  } catch (e) {
    return {
      app, url,
      ok: false,
      status: null,
      latencyMs: Date.now() - t0,
      detail: e instanceof Error ? e.message : String(e),
      body: null,
    };
  }
}

async function loadState(): Promise<Record<string, { last_ok: boolean; failed_since: string | null }>> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/health_monitor_state?select=app,last_ok,failed_since`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) return {};
  const rows = await r.json();
  const map: Record<string, { last_ok: boolean; failed_since: string | null }> = {};
  for (const row of rows) map[row.app] = { last_ok: row.last_ok, failed_since: row.failed_since };
  return map;
}

async function upsertState(app: string, ok: boolean, failed_since: string | null): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/health_monitor_state`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ app, last_ok: ok, failed_since, last_checked_at: new Date().toISOString() }),
  });
}

async function tg(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

Deno.serve(async (req) => {
  const auth = req.headers.get('x-health-token') ?? '';
  if (auth !== HEALTH_MONITOR_TOKEN || !HEALTH_MONITOR_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }

  const results = await Promise.all(ENDPOINTS.map((e) => probe(e.app, e.url)));
  const state = await loadState();
  const now = new Date().toISOString();

  const transitions: { app: string; transition: 'down' | 'up'; result: ProbeResult; downSince: string | null }[] = [];
  for (const r of results) {
    const prev = state[r.app];
    // Cold-start case: no prior row for this app. Persist the current state
    // silently — we have nothing to compare against, so emitting a "down" or
    // "RECOVERED" alert would be misleading (and on a fresh deploy spammed
    // Iulian with three 🟢 messages for apps that were never down).
    if (!prev) {
      const downSince = !r.ok ? now : null;
      await upsertState(r.app, r.ok, downSince);
      continue;
    }
    if (prev.last_ok !== r.ok) {
      const downSince = !r.ok ? (prev.failed_since ?? now) : null;
      const transition = !r.ok ? 'down' : 'up';
      transitions.push({ app: r.app, transition, result: r, downSince });
      await upsertState(r.app, r.ok, downSince);
    } else if (!r.ok && prev.failed_since == null) {
      await upsertState(r.app, false, now);
    } else {
      await upsertState(r.app, r.ok, prev.failed_since);
    }
  }

  for (const t of transitions) {
    if (t.transition === 'down') {
      await tg(`🔴 <b>UPTIME ALERT — ${t.result.app}</b>\nstatus=<code>${t.result.status ?? 'timeout'}</code> latency=<code>${t.result.latencyMs}ms</code>\n${t.result.detail ?? ''}\n<code>${t.result.url}</code>`);
    } else {
      const downedAt = state[t.result.app]?.failed_since;
      const durationMin = downedAt ? Math.round((Date.now() - new Date(downedAt).getTime()) / 60000) : null;
      await tg(`🟢 <b>RECOVERED — ${t.result.app}</b>\nstatus=<code>${t.result.status}</code> latency=<code>${t.result.latencyMs}ms</code>${durationMin !== null ? `\ndowntime: <b>${durationMin} min</b>` : ''}`);
    }
  }

  return Response.json({
    checked: results.length,
    transitions: transitions.length,
    results: results.map((r) => ({ app: r.app, ok: r.ok, status: r.status, latencyMs: r.latencyMs })),
    ts: now,
  });
});
