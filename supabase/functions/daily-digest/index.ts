// RSHIR-35 — daily revenue digest email.
//
// Triggered by the `daily-digest` pg_cron job at 07:00 UTC (= 09:00
// Europe/Bucharest in winter, 10:00 in summer; DST drift accepted for
// MVP). The job calls this endpoint with empty body so we iterate every
// tenant for yesterday. Operators can also POST a specific
// `{ tenant_id, day }` for replays / manual tests.
//
// Auth: same shared-secret model as notify-new-order (RSHIR-22).
//   HIR_NOTIFY_SECRET — required, sent by pg_net as `x-hir-notify-secret`.
//
// Env (Supabase function secrets):
//   RESEND_API_KEY     — Resend API key.
//   RESEND_FROM_EMAIL  — sender (default onboarding@resend.dev).
//   ADMIN_BASE_URL     — restaurant-admin base, deep-link to analytics.
// Auto-injected:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Resend } from 'https://esm.sh/resend@4.0.1';

type Body = { tenant_id?: string; day?: string };

type OrderRow = {
  total_ron: number | string | null;
  items: unknown;
  created_at: string;
};

type ItemSnap = {
  name?: string;
  item_name?: string;
  qty?: number;
  quantity?: number;
  price_ron?: number | string;
  unit_price_ron?: number | string;
  price?: number | string;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function isYmd(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function fmtRon(n: number | string | null | undefined): string {
  return `${Number(n ?? 0).toFixed(2)} RON`;
}

function yesterdayUtc(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function dayBounds(day: string): { startIso: string; endIso: string } {
  // UTC day window. Cron is 07:00 UTC so "yesterday in UTC" overlaps the
  // operator's mental model of "yesterday" in RO time closely enough for MVP.
  const start = new Date(`${day}T00:00:00Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

type Metrics = {
  total: number;
  count: number;
  topItems: Array<{ name: string; qty: number }>;
  peakHourLabel: string | null;
};

function computeMetrics(rows: OrderRow[]): Metrics {
  let total = 0;
  let count = 0;
  const itemQty = new Map<string, number>();
  const hourCount = new Map<number, number>();
  for (const r of rows) {
    total += Number(r.total_ron ?? 0);
    count += 1;
    const hour = new Date(r.created_at).getUTCHours();
    hourCount.set(hour, (hourCount.get(hour) ?? 0) + 1);
    if (Array.isArray(r.items)) {
      for (const li of r.items as ItemSnap[]) {
        const name = li.name ?? li.item_name ?? '(articol)';
        const qty = Number(li.qty ?? li.quantity ?? 1);
        itemQty.set(name, (itemQty.get(name) ?? 0) + qty);
      }
    }
  }
  const topItems = Array.from(itemQty.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, qty]) => ({ name, qty }));
  let peakHourLabel: string | null = null;
  if (hourCount.size > 0) {
    const [peakHour] = Array.from(hourCount.entries()).sort((a, b) => b[1] - a[1])[0];
    peakHourLabel = `${String(peakHour).padStart(2, '0')}:00–${String(peakHour + 1).padStart(2, '0')}:00 UTC`;
  }
  return { total, count, topItems, peakHourLabel };
}

async function getOwnerEmails(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data: members, error } = await supabase
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'OWNER');
  if (error || !members) return [];
  const emails: string[] = [];
  for (const m of members) {
    const { data: au } = await supabase.auth.admin.getUserById(m.user_id);
    const email = au?.user?.email;
    if (email) emails.push(email);
  }
  return emails;
}

type ProcessResult = {
  tenant_id: string;
  status: 'sent' | 'opted_out' | 'digest_opted_out' | 'no_orders' | 'no_owner_emails' | 'error';
  detail?: string;
  recipients?: number;
};

async function processTenant(
  supabase: SupabaseClient,
  resend: Resend | null,
  from: string,
  adminBase: string,
  tenant: { id: string; name: string; settings: Record<string, unknown> | null },
  day: string,
): Promise<ProcessResult> {
  const settings = tenant.settings ?? {};
  if (settings.email_notifications_enabled === false) {
    return { tenant_id: tenant.id, status: 'opted_out' };
  }
  if (settings.daily_digest_enabled === false) {
    return { tenant_id: tenant.id, status: 'digest_opted_out' };
  }

  const { startIso, endIso } = dayBounds(day);
  const { data: orders, error: ordersErr } = await supabase
    .from('restaurant_orders')
    .select('total_ron, items, created_at')
    .eq('tenant_id', tenant.id)
    .not('status', 'in', '(CANCELLED,PENDING)')
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (ordersErr) {
    return { tenant_id: tenant.id, status: 'error', detail: ordersErr.message };
  }
  const metrics = computeMetrics((orders ?? []) as OrderRow[]);
  if (metrics.count === 0) {
    return { tenant_id: tenant.id, status: 'no_orders' };
  }

  const recipients = await getOwnerEmails(supabase, tenant.id);
  if (recipients.length === 0) {
    return { tenant_id: tenant.id, status: 'no_owner_emails' };
  }
  if (!resend) {
    return { tenant_id: tenant.id, status: 'error', detail: 'resend_not_configured' };
  }

  const subject = `HIR — ${tenant.name} — ${day}: ${fmtRon(metrics.total)} din ${metrics.count} comenzi`;
  const itemsBlock =
    metrics.topItems.length > 0
      ? metrics.topItems.map((it) => `  • ${it.qty} × ${it.name}`).join('\n')
      : '  (fără articole în vânzări)';
  const peakLine = metrics.peakHourLabel
    ? `Oră de vârf: ${metrics.peakHourLabel}.`
    : 'Oră de vârf: indisponibilă.';
  const analyticsLink = adminBase
    ? `${adminBase.replace(/\/$/, '')}/dashboard/analytics`
    : '(setează ADMIN_BASE_URL pentru link)';
  const text = [
    `Raport zilnic ${tenant.name} — ${day}.`,
    '',
    `Total: ${fmtRon(metrics.total)} din ${metrics.count} comenzi.`,
    peakLine,
    '',
    'Top articole:',
    itemsBlock,
    '',
    `Detalii (admin): ${analyticsLink}`,
    '',
    '— HIR Restaurant Suite',
  ].join('\n');

  let sentOk = 0;
  for (const to of recipients) {
    try {
      const r = await resend.emails.send({ from, to, subject, text });
      if (r.error) {
        console.error('[daily-digest] resend error', tenant.id, to, r.error);
      } else {
        sentOk += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[daily-digest] resend throw', tenant.id, to, msg);
    }
  }
  return { tenant_id: tenant.id, status: 'sent', recipients: sentOk };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) {
    console.error('[daily-digest] HIR_NOTIFY_SECRET not configured');
    return json(500, { error: 'secret_not_configured' });
  }
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return json(401, { error: 'unauthorized' });

  let body: Body = {};
  const raw = await req.text();
  if (raw && raw.trim().length > 0) {
    try {
      body = JSON.parse(raw) as Body;
    } catch {
      return json(400, { error: 'invalid_json' });
    }
  }
  if (body.tenant_id !== undefined && !isUuid(body.tenant_id)) {
    return json(400, { error: 'invalid_tenant_id' });
  }
  if (body.day !== undefined && !isYmd(body.day)) {
    return json(400, { error: 'invalid_day' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
  const ADMIN_BASE = Deno.env.get('ADMIN_BASE_URL') ?? '';
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'supabase_env_missing' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

  const day = body.day ?? yesterdayUtc();

  let tenants: Array<{ id: string; name: string; settings: Record<string, unknown> | null }>;
  if (body.tenant_id) {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, settings')
      .eq('id', body.tenant_id)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error('[daily-digest] tenant lookup failed:', error.message);
      return json(404, { error: 'tenant_not_found' });
    }
    tenants = [data as typeof tenants[number]];
  } else {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, settings');
    if (error) {
      console.error('[daily-digest] tenants query failed:', error.message);
      return json(500, { error: 'tenants_query_failed' });
    }
    tenants = (data ?? []) as typeof tenants;
  }

  const results: ProcessResult[] = [];
  for (const t of tenants) {
    const r = await processTenant(supabase, resend, FROM, ADMIN_BASE, t, day);
    results.push(r);
  }

  // Single-tenant requests return a top-level `skipped` to match the
  // verification contract; multi-tenant runs return the per-tenant array.
  if (body.tenant_id && results.length === 1) {
    const r = results[0];
    if (r.status === 'sent') {
      return json(200, { ok: true, day, sent: r.recipients ?? 0 });
    }
    return json(200, { ok: true, day, skipped: r.status, detail: r.detail });
  }
  return json(200, { ok: true, day, results });
});
