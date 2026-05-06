// Lane ANALYTICS-DIGEST (2026-05-05)
//
// Weekly KPI digest email. Triggered Mondays 05:00 UTC by pg_cron with empty
// body -- iterates every ACTIVE tenant for the previous calendar week
// (Mon..Sun). Operators can also POST `{ tenant_id, week_start }` to replay.
//
// Two digest kinds:
//   TENANT_OWNER   -- branded HTML to OWNER members of ACTIVE tenants;
//                     opt-out via tenants.settings.weekly_digest_enabled=false.
//   PLATFORM_ADMIN -- platform-wide aggregate to Iulian + Telegram one-liner.
//
// Auth: shared `HIR_NOTIFY_SECRET` (same as daily-digest + notify-new-order).
//
// Required Edge Function secrets:
//   HIR_NOTIFY_SECRET           shared cron HMAC
//   RESEND_API_KEY              Resend transactional email
//   RESEND_FROM_EMAIL           sender (default support@hir.ro)
//   ADMIN_BASE_URL              admin app base for deep-links to /dashboard/analytics
//   PLATFORM_ADMIN_EMAIL        platform digest recipient (default iulianm698@gmail.com)
//   TELEGRAM_BOT_TOKEN          optional -- 1-line summary to Hepi
//   TELEGRAM_IULIAN_CHAT_ID     optional -- chat id (also TELEGRAM_CHAT_ID fallback)
// Auto-injected:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Resend } from 'https://esm.sh/resend@4.0.1';
// Lane 9 observability — additive wrap, never changes behavior.
import { withRunLog } from '../_shared/log.ts';

type Body = { tenant_id?: string; week_start?: string; force?: boolean };

type OrderRow = {
  total_ron: number | string | null;
  items: unknown;
  customer_id: string | null;
  status: string;
  created_at: string;
};

type ItemSnap = {
  name?: string;
  item_name?: string;
  qty?: number;
  quantity?: number;
};

type ReviewRow = { rating: number; created_at: string };

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

function pct(curr: number, prev: number): string {
  if (prev === 0) {
    return curr === 0 ? '0%' : '+nou';
  }
  const p = ((curr - prev) / prev) * 100;
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

// Returns the ISO date (YYYY-MM-DD) of the Monday of the week that contains
// the given UTC date. Last week start = today's Monday minus 7 days.
function lastWeekStartUtc(): string {
  const now = new Date();
  // 0=Sun, 1=Mon ... 6=Sat
  const dow = now.getUTCDay();
  const daysSinceMon = (dow + 6) % 7; // Mon=0, Sun=6
  const thisMon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMon));
  const lastMon = new Date(thisMon.getTime() - 7 * 24 * 60 * 60 * 1000);
  return lastMon.toISOString().slice(0, 10);
}

function weekBounds(weekStart: string): {
  startIso: string;
  endIso: string;
  prevStartIso: string;
  prevEndIso: string;
  rangeLabel: string;
} {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const prevStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastDay = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  // RO short label: "12 — 18 mai"
  const months = [
    'ianuarie',
    'februarie',
    'martie',
    'aprilie',
    'mai',
    'iunie',
    'iulie',
    'august',
    'septembrie',
    'octombrie',
    'noiembrie',
    'decembrie',
  ];
  const sameMonth = start.getUTCMonth() === lastDay.getUTCMonth();
  const rangeLabel = sameMonth
    ? `${start.getUTCDate()} — ${lastDay.getUTCDate()} ${months[start.getUTCMonth()]} ${start.getUTCFullYear()}`
    : `${start.getUTCDate()} ${months[start.getUTCMonth()]} — ${lastDay.getUTCDate()} ${months[lastDay.getUTCMonth()]} ${start.getUTCFullYear()}`;
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    prevStartIso: prevStart.toISOString(),
    prevEndIso: start.toISOString(),
    rangeLabel,
  };
}

type Metrics = {
  total: number;
  count: number;
  avgTicket: number;
  topItems: Array<{ name: string; qty: number }>;
  topCustomerCount: number;
  reviewsCount: number;
  reviewsAvg: number;
  prevTotal: number;
  prevCount: number;
};

function computeOrderMetrics(rows: OrderRow[]): {
  total: number;
  count: number;
  topItems: Array<{ name: string; qty: number }>;
  topCustomerCount: number;
} {
  let total = 0;
  let count = 0;
  const itemQty = new Map<string, number>();
  const customerCount = new Map<string, number>();
  for (const r of rows) {
    if (r.status === 'CANCELLED' || r.status === 'PENDING') continue;
    total += Number(r.total_ron ?? 0);
    count += 1;
    if (r.customer_id) {
      customerCount.set(r.customer_id, (customerCount.get(r.customer_id) ?? 0) + 1);
    }
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
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));
  let topCustomerCount = 0;
  for (const v of customerCount.values()) {
    if (v > topCustomerCount) topCustomerCount = v;
  }
  return { total, count, topItems, topCustomerCount };
}

// ============================================================
// Email layout (inline-CSS, mobile-first, RO formal).
// Mirrors apps/restaurant-admin/src/lib/email/layout.ts but kept inline
// because Edge Functions cannot import Next.js workspace packages.
// ============================================================
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function kpiTile(label: string, value: string, hint?: string): string {
  return `<td align="center" style="padding:14px 8px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;width:33%">
    <div style="font-size:11px;color:#71717a;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(label)}</div>
    <div style="font-size:20px;font-weight:700;color:#18181b;margin-top:4px">${escapeHtml(value)}</div>
    ${hint ? `<div style="font-size:11px;color:#a1a1aa;margin-top:2px">${escapeHtml(hint)}</div>` : ''}
  </td>`;
}

function renderTenantEmail(args: {
  tenantName: string;
  rangeLabel: string;
  metrics: Metrics;
  analyticsUrl: string;
}): string {
  const { tenantName, rangeLabel, metrics, analyticsUrl } = args;
  const ordersDelta = pct(metrics.count, metrics.prevCount);
  const revenueDelta = pct(metrics.total, metrics.prevTotal);

  const itemsList =
    metrics.topItems.length > 0
      ? `<ol style="margin:0;padding-left:18px;color:#27272a;font-size:14px;line-height:1.6">
          ${metrics.topItems.map((it) => `<li>${escapeHtml(it.name)} — ${it.qty} buc.</li>`).join('')}
        </ol>`
      : `<p style="margin:0;color:#71717a;font-size:13px">(fără articole vândute săptămâna trecută)</p>`;

  const ratingLine =
    metrics.reviewsCount > 0
      ? `${metrics.reviewsAvg.toFixed(2)} / 5 (${metrics.reviewsCount} recenzii noi)`
      : 'fără recenzii noi';

  const topCustomerLine =
    metrics.topCustomerCount >= 2
      ? `Cel mai bun client al săptămânii a comandat de <strong>${metrics.topCustomerCount} ori</strong>.`
      : 'Niciun client nu a revenit săptămâna aceasta — invitați clienții să se înregistreze.';

  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#18181b">Raport săptămânal — ${escapeHtml(tenantName)}</h1>
    <p style="margin:0 0 18px;color:#71717a;font-size:13px">${escapeHtml(rangeLabel)}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin-bottom:18px">
      <tr>
        ${kpiTile('Comenzi', String(metrics.count), ordersDelta + ' vs s. trecută')}
        ${kpiTile('Încasări', fmtRon(metrics.total), revenueDelta)}
        ${kpiTile('Coș mediu', fmtRon(metrics.avgTicket), '')}
      </tr>
    </table>

    <div style="margin:0 0 18px;padding:14px 16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
      <div style="font-size:13px;color:#71717a;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">Top 5 produse</div>
      ${itemsList}
    </div>

    <div style="margin:0 0 18px;padding:14px 16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
      <div style="font-size:13px;color:#71717a;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">Recenzii</div>
      <div style="font-size:14px;color:#27272a">${escapeHtml(ratingLine)}</div>
    </div>

    <div style="margin:0 0 24px;padding:14px 16px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px">
      <div style="font-size:14px;color:#581c87;line-height:1.55">${topCustomerLine}</div>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0">
      <tr>
        <td style="border-radius:8px;background:#7c3aed">
          <a href="${escapeHtml(analyticsUrl)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
            Vezi raportul detaliat
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;color:#71717a;font-size:12px;line-height:1.5">
      Primiți acest raport pentru că sunteți proprietar (OWNER) pe platforma HIR.
      Pentru a opri raportul săptămânal, accesați <em>Setări → Notificări</em> în panoul de administrare.
    </p>
  `;

  const preheader = `${metrics.count} comenzi · ${fmtRon(metrics.total)} · ${rangeLabel}`;

  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Raport săptămânal HIR — ${escapeHtml(tenantName)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#18181b">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
            <tr>
              <td align="center" style="padding:18px 24px;border-top:3px solid #7c3aed;border-bottom:1px solid #f4f4f5">
                <span style="font-size:18px;font-weight:600;color:#18181b">HIR Restaurant Suite</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px">${body}</td>
            </tr>
            <tr>
              <td style="padding:14px 24px 18px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;text-align:center;line-height:1.5">
                Trimis prin <strong style="color:#71717a">HIR</strong> · <a href="https://hir.ro" style="color:#a1a1aa;text-decoration:none">hir.ro</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderPlatformEmail(args: {
  rangeLabel: string;
  totalGmv: number;
  totalOrders: number;
  activeTenants: number;
  prevGmv: number;
  prevOrders: number;
  topByOrders: Array<{ name: string; count: number }>;
  topByRevenue: Array<{ name: string; revenue: number }>;
}): string {
  const { rangeLabel, totalGmv, totalOrders, activeTenants, prevGmv, prevOrders, topByOrders, topByRevenue } = args;
  const ordersDelta = pct(totalOrders, prevOrders);
  const revenueDelta = pct(totalGmv, prevGmv);

  const list = (rows: string[]) =>
    rows.length > 0
      ? `<ol style="margin:0;padding-left:18px;color:#27272a;font-size:14px;line-height:1.7">${rows.join('')}</ol>`
      : `<p style="margin:0;color:#71717a;font-size:13px">(niciun tenant cu activitate)</p>`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#18181b">Raport platformă HIR</h1>
    <p style="margin:0 0 18px;color:#71717a;font-size:13px">${escapeHtml(rangeLabel)} · ${activeTenants} tenant${activeTenants === 1 ? '' : 'i'} active</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin-bottom:18px">
      <tr>
        ${kpiTile('GMV total', fmtRon(totalGmv), revenueDelta + ' vs s. trec.')}
        ${kpiTile('Comenzi', String(totalOrders), ordersDelta)}
        ${kpiTile('Tenanți activi', String(activeTenants), '')}
      </tr>
    </table>

    <div style="margin:0 0 14px;padding:14px 16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
      <div style="font-size:13px;color:#71717a;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">Top tenanți după volum</div>
      ${list(topByOrders.slice(0, 5).map((t) => `<li>${escapeHtml(t.name)} — ${t.count} comenzi</li>`))}
    </div>

    <div style="margin:0 0 14px;padding:14px 16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
      <div style="font-size:13px;color:#71717a;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">Top tenanți după încasări</div>
      ${list(topByRevenue.slice(0, 5).map((t) => `<li>${escapeHtml(t.name)} — ${fmtRon(t.revenue)}</li>`))}
    </div>

    <p style="margin:18px 0 0;color:#71717a;font-size:12px;line-height:1.5">
      Raport generat automat luni 08:00 EET. Internal — nu redistribui.
    </p>
  `;

  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Raport platformă HIR — ${escapeHtml(rangeLabel)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
            <tr>
              <td align="center" style="padding:18px 24px;border-top:3px solid #7c3aed;border-bottom:1px solid #f4f4f5">
                <span style="font-size:18px;font-weight:600;color:#18181b">HIR Platform Admin</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px">${body}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ============================================================
// Per-tenant processing
// ============================================================
type ProcessResult = {
  tenant_id: string;
  tenant_name: string;
  status: 'sent' | 'opted_out' | 'no_orders' | 'no_owner_emails' | 'error';
  detail?: string;
  recipients?: number;
  metrics?: { count: number; total: number };
};

async function getOwnerEmails(supabase: SupabaseClient, tenantId: string): Promise<string[]> {
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

async function logDigest(
  supabase: SupabaseClient,
  row: {
    tenant_id: string | null;
    week_start: string;
    recipient_email: string | null;
    digest_kind: 'TENANT_OWNER' | 'PLATFORM_ADMIN';
    delivery_status: 'SENT' | 'FAILED' | 'SKIPPED';
    detail?: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from('analytics_digest_log').insert({
    tenant_id: row.tenant_id,
    week_start: row.week_start,
    recipient_email: row.recipient_email,
    digest_kind: row.digest_kind,
    sent_at: row.delivery_status === 'SENT' ? new Date().toISOString() : null,
    delivery_status: row.delivery_status,
    detail: row.detail ?? null,
    payload: row.payload ?? {},
  });
}

async function processTenant(
  supabase: SupabaseClient,
  resend: Resend | null,
  from: string,
  adminBase: string,
  tenant: { id: string; name: string; settings: Record<string, unknown> | null; status: string },
  weekStart: string,
): Promise<ProcessResult> {
  const settings = tenant.settings ?? {};
  // Default ON; explicit false opts out.
  if (settings.weekly_digest_enabled === false || settings.email_notifications_enabled === false) {
    await logDigest(supabase, {
      tenant_id: tenant.id,
      week_start: weekStart,
      recipient_email: null,
      digest_kind: 'TENANT_OWNER',
      delivery_status: 'SKIPPED',
      detail: 'opted_out',
    });
    return { tenant_id: tenant.id, tenant_name: tenant.name, status: 'opted_out' };
  }

  const { startIso, endIso, prevStartIso, prevEndIso, rangeLabel } = weekBounds(weekStart);

  // Current week orders
  const { data: orders, error: ordersErr } = await supabase
    .from('restaurant_orders')
    .select('total_ron, items, customer_id, status, created_at')
    .eq('tenant_id', tenant.id)
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (ordersErr) {
    await logDigest(supabase, {
      tenant_id: tenant.id,
      week_start: weekStart,
      recipient_email: null,
      digest_kind: 'TENANT_OWNER',
      delivery_status: 'FAILED',
      detail: ordersErr.message,
    });
    return { tenant_id: tenant.id, tenant_name: tenant.name, status: 'error', detail: ordersErr.message };
  }
  const cur = computeOrderMetrics((orders ?? []) as OrderRow[]);

  if (cur.count === 0) {
    await logDigest(supabase, {
      tenant_id: tenant.id,
      week_start: weekStart,
      recipient_email: null,
      digest_kind: 'TENANT_OWNER',
      delivery_status: 'SKIPPED',
      detail: 'no_orders',
    });
    return { tenant_id: tenant.id, tenant_name: tenant.name, status: 'no_orders' };
  }

  // Previous week (for delta)
  const { data: prevOrders } = await supabase
    .from('restaurant_orders')
    .select('total_ron, items, customer_id, status, created_at')
    .eq('tenant_id', tenant.id)
    .gte('created_at', prevStartIso)
    .lt('created_at', prevEndIso);
  const prev = computeOrderMetrics((prevOrders ?? []) as OrderRow[]);

  // Reviews this week
  const { data: reviews } = await supabase
    .from('restaurant_reviews')
    .select('rating, created_at')
    .eq('tenant_id', tenant.id)
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  const rRows = (reviews ?? []) as ReviewRow[];
  const reviewsAvg = rRows.length > 0 ? rRows.reduce((s, r) => s + r.rating, 0) / rRows.length : 0;

  const metrics: Metrics = {
    total: cur.total,
    count: cur.count,
    avgTicket: cur.count > 0 ? cur.total / cur.count : 0,
    topItems: cur.topItems,
    topCustomerCount: cur.topCustomerCount,
    reviewsCount: rRows.length,
    reviewsAvg,
    prevTotal: prev.total,
    prevCount: prev.count,
  };

  const recipients = await getOwnerEmails(supabase, tenant.id);
  if (recipients.length === 0) {
    await logDigest(supabase, {
      tenant_id: tenant.id,
      week_start: weekStart,
      recipient_email: null,
      digest_kind: 'TENANT_OWNER',
      delivery_status: 'SKIPPED',
      detail: 'no_owner_emails',
    });
    return { tenant_id: tenant.id, tenant_name: tenant.name, status: 'no_owner_emails' };
  }
  if (!resend) {
    await logDigest(supabase, {
      tenant_id: tenant.id,
      week_start: weekStart,
      recipient_email: null,
      digest_kind: 'TENANT_OWNER',
      delivery_status: 'FAILED',
      detail: 'resend_not_configured',
    });
    return { tenant_id: tenant.id, tenant_name: tenant.name, status: 'error', detail: 'resend_not_configured' };
  }

  const analyticsUrl = adminBase
    ? `${adminBase.replace(/\/$/, '')}/dashboard/analytics`
    : 'https://hir.ro';
  const subject = `Raport saptamanal HIR — ${tenant.name} — ${rangeLabel}`;
  const html = renderTenantEmail({
    tenantName: tenant.name,
    rangeLabel,
    metrics,
    analyticsUrl,
  });

  let sentOk = 0;
  for (const to of recipients) {
    try {
      const r = await resend.emails.send({ from, to, subject, html });
      if (r.error) {
        const errMsg = (() => {
          try {
            return JSON.stringify(r.error);
          } catch {
            return String(r.error);
          }
        })();
        console.error('[weekly-digest] resend error', tenant.id, to, errMsg);
        await logDigest(supabase, {
          tenant_id: tenant.id,
          week_start: weekStart,
          recipient_email: to,
          digest_kind: 'TENANT_OWNER',
          delivery_status: 'FAILED',
          detail: errMsg,
          payload: { count: metrics.count, total: metrics.total },
        });
      } else {
        sentOk += 1;
        await logDigest(supabase, {
          tenant_id: tenant.id,
          week_start: weekStart,
          recipient_email: to,
          digest_kind: 'TENANT_OWNER',
          delivery_status: 'SENT',
          payload: { count: metrics.count, total: metrics.total },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[weekly-digest] resend throw', tenant.id, to, msg);
      await logDigest(supabase, {
        tenant_id: tenant.id,
        week_start: weekStart,
        recipient_email: to,
        digest_kind: 'TENANT_OWNER',
        delivery_status: 'FAILED',
        detail: msg,
      });
    }
  }
  return {
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    status: sentOk > 0 ? 'sent' : 'error',
    detail: sentOk === 0 ? 'all_recipients_failed' : undefined,
    recipients: sentOk,
    metrics: { count: metrics.count, total: metrics.total },
  };
}

// ============================================================
// Platform-level digest
// ============================================================
async function processPlatform(
  supabase: SupabaseClient,
  resend: Resend | null,
  from: string,
  weekStart: string,
  perTenant: ProcessResult[],
  activeTenants: Array<{ id: string; name: string; status: string }>,
): Promise<{ status: string; detail?: string }> {
  const PLATFORM_EMAIL = Deno.env.get('PLATFORM_ADMIN_EMAIL') ?? 'iulianm698@gmail.com';
  const TG_BOT = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const TG_CHAT = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID') ?? Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

  const { startIso, endIso, prevStartIso, prevEndIso, rangeLabel } = weekBounds(weekStart);

  // Aggregate this week across all ACTIVE tenants in one query.
  const tenantIds = activeTenants.map((t) => t.id);
  if (tenantIds.length === 0) {
    return { status: 'no_active_tenants' };
  }

  const { data: weekOrders } = await supabase
    .from('restaurant_orders')
    .select('tenant_id, total_ron, status, created_at')
    .in('tenant_id', tenantIds)
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  const { data: prevWeekOrders } = await supabase
    .from('restaurant_orders')
    .select('tenant_id, total_ron, status, created_at')
    .in('tenant_id', tenantIds)
    .gte('created_at', prevStartIso)
    .lt('created_at', prevEndIso);

  type Agg = { count: number; revenue: number };
  const byTenant = new Map<string, Agg>();
  let totalGmv = 0;
  let totalOrders = 0;
  for (const o of (weekOrders ?? []) as Array<{
    tenant_id: string;
    total_ron: number | string | null;
    status: string;
  }>) {
    if (o.status === 'CANCELLED' || o.status === 'PENDING') continue;
    const a = byTenant.get(o.tenant_id) ?? { count: 0, revenue: 0 };
    a.count += 1;
    a.revenue += Number(o.total_ron ?? 0);
    byTenant.set(o.tenant_id, a);
    totalOrders += 1;
    totalGmv += Number(o.total_ron ?? 0);
  }

  let prevGmv = 0;
  let prevOrders = 0;
  for (const o of (prevWeekOrders ?? []) as Array<{
    total_ron: number | string | null;
    status: string;
  }>) {
    if (o.status === 'CANCELLED' || o.status === 'PENDING') continue;
    prevOrders += 1;
    prevGmv += Number(o.total_ron ?? 0);
  }

  const tenantNameById = new Map(activeTenants.map((t) => [t.id, t.name] as const));
  const ranked = Array.from(byTenant.entries()).map(([id, a]) => ({
    name: tenantNameById.get(id) ?? id.slice(0, 8),
    count: a.count,
    revenue: a.revenue,
  }));
  const topByOrders = [...ranked].sort((a, b) => b.count - a.count);
  const topByRevenue = [...ranked].sort((a, b) => b.revenue - a.revenue);

  // Persist log row regardless of email success.
  const payload = {
    total_gmv: totalGmv,
    total_orders: totalOrders,
    active_tenants: activeTenants.length,
    prev_gmv: prevGmv,
    prev_orders: prevOrders,
    top_by_orders: topByOrders.slice(0, 10),
    top_by_revenue: topByRevenue.slice(0, 10),
    per_tenant_summary_count: perTenant.length,
  };

  if (!resend) {
    await logDigest(supabase, {
      tenant_id: null,
      week_start: weekStart,
      recipient_email: PLATFORM_EMAIL,
      digest_kind: 'PLATFORM_ADMIN',
      delivery_status: 'FAILED',
      detail: 'resend_not_configured',
      payload,
    });
    return { status: 'resend_not_configured' };
  }

  const subject = `Raport platforma HIR — ${rangeLabel} — ${fmtRon(totalGmv)} / ${totalOrders} comenzi`;
  const html = renderPlatformEmail({
    rangeLabel,
    totalGmv,
    totalOrders,
    activeTenants: activeTenants.length,
    prevGmv,
    prevOrders,
    topByOrders,
    topByRevenue,
  });

  let emailStatus: 'SENT' | 'FAILED' = 'FAILED';
  let emailDetail: string | undefined;
  try {
    const r = await resend.emails.send({ from, to: PLATFORM_EMAIL, subject, html });
    if (r.error) {
      try {
        emailDetail = JSON.stringify(r.error);
      } catch {
        emailDetail = String(r.error);
      }
      console.error('[weekly-digest] platform resend error', emailDetail);
    } else {
      emailStatus = 'SENT';
    }
  } catch (e) {
    emailDetail = e instanceof Error ? e.message : String(e);
    console.error('[weekly-digest] platform resend throw', emailDetail);
  }

  await logDigest(supabase, {
    tenant_id: null,
    week_start: weekStart,
    recipient_email: PLATFORM_EMAIL,
    digest_kind: 'PLATFORM_ADMIN',
    delivery_status: emailStatus,
    detail: emailDetail,
    payload,
  });

  // Telegram one-liner (fire-and-forget).
  if (TG_BOT && TG_CHAT) {
    const tgText = `<b>Raport platforma HIR</b>\n${rangeLabel}\nGMV: ${fmtRon(totalGmv)} (${pct(totalGmv, prevGmv)})\nComenzi: ${totalOrders} (${pct(totalOrders, prevOrders)})\nTenanti activi: ${activeTenants.length}`;
    try {
      await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TG_CHAT,
          text: tgText,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
    } catch (e) {
      console.error('[weekly-digest] telegram error', e instanceof Error ? e.message : String(e));
    }
  }

  return { status: emailStatus.toLowerCase(), detail: emailDetail };
}

// ============================================================
// HTTP entry
// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  return withRunLog('weekly-analytics-digest', async ({ setMetadata }) => {
  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) {
    console.error('[weekly-digest] HIR_NOTIFY_SECRET not configured');
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
  if (body.week_start !== undefined && !isYmd(body.week_start)) {
    return json(400, { error: 'invalid_week_start' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'support@hir.ro';
  const ADMIN_BASE = Deno.env.get('ADMIN_BASE_URL') ?? '';
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'supabase_env_missing' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

  const weekStart = body.week_start ?? lastWeekStartUtc();

  // Active tenants. Single-tenant requests bypass the ACTIVE filter so
  // operators can replay for any tenant.
  let tenants: Array<{
    id: string;
    name: string;
    status: string;
    settings: Record<string, unknown> | null;
  }>;
  if (body.tenant_id) {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, status, settings')
      .eq('id', body.tenant_id)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error('[weekly-digest] tenant lookup failed:', error.message);
      return json(404, { error: 'tenant_not_found' });
    }
    tenants = [data as typeof tenants[number]];
  } else {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, status, settings')
      .eq('status', 'ACTIVE');
    if (error) {
      console.error('[weekly-digest] tenants query failed:', error.message);
      return json(500, { error: 'tenants_query_failed' });
    }
    tenants = (data ?? []) as typeof tenants;
  }

  const results: ProcessResult[] = [];
  for (const t of tenants) {
    const r = await processTenant(supabase, resend, FROM, ADMIN_BASE, t, weekStart);
    results.push(r);
  }

  // Platform digest only on full runs (no tenant_id filter), or when force=true.
  let platform: { status: string; detail?: string } | null = null;
  if (!body.tenant_id || body.force) {
    const activeTenants = tenants
      .filter((t) => t.status === 'ACTIVE')
      .map((t) => ({ id: t.id, name: t.name, status: t.status }));
    platform = await processPlatform(supabase, resend, FROM, weekStart, results, activeTenants);
  }

  // Record metadata BEFORE the single-tenant early return so manual replays
  // remain queryable in function_runs (per Codex review on PR #289).
  setMetadata({
    week_start: weekStart,
    tenants_processed: results.length,
    sent: results.filter((r) => r.status === 'sent').length,
    platform_status: platform?.status ?? null,
    tenant_id: body.tenant_id ?? null,
  });

  if (body.tenant_id && results.length === 1 && !body.force) {
    const r = results[0];
    if (r.status === 'sent') {
      return json(200, { ok: true, week_start: weekStart, sent: r.recipients ?? 0, tenant: r.tenant_name });
    }
    return json(200, { ok: true, week_start: weekStart, skipped: r.status, detail: r.detail });
  }

  return json(200, {
    ok: true,
    week_start: weekStart,
    tenants: results.length,
    sent: results.filter((r) => r.status === 'sent').length,
    platform,
  });
  });
});
