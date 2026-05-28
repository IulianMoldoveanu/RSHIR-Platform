// HIR Connect — Weekly auto-invoicing Edge Function.
//
// Runs every Monday 03:00 UTC via pg_cron (see migration
// 20260617_001_connect_weekly_invoices.sql).
//
// For every active HIR Connect tenant (delivery_mode = 'headless'):
//   1. Counts DELIVERED orders in the previous Mon 00:00 UTC → Sun 23:59:59 UTC
//   2. Skips tenants with 0 orders (no invoice emitted)
//   3. Inserts a `connect_weekly_invoices` row — UNIQUE(tenant_id, week_start)
//      makes double-fire idempotent (duplicate → silent skip)
//   4. Sends an invoice email to all OWNER members via Resend
//
// Fees:
//   Platform: 200 bani (2 RON) × every DELIVERED order
//   Courier:  100 bani (1 RON) × orders with hir_delivery_id IS NOT NULL
//   Due: 5 calendar days from Monday (= that Saturday)
//
// Required secrets (supabase secrets set …):
//   HIR_NOTIFY_SECRET       — shared secret, x-hir-notify-secret header
//   RESEND_API_KEY          — Resend API key (re_…)
//   RESEND_FROM_EMAIL       — sender (e.g. facturi@hirforyou.ro)
//   ADMIN_BASE_URL          — https://admin.hirforyou.ro (for invoice deep-link)
// Auto-injected by Supabase Edge runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Resend } from 'https://esm.sh/resend@4.0.1';
import { withRunLog } from '../_shared/log.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_FEE_BANI = 200; // 2 RON per delivered order
const COURIER_FEE_BANI = 100;  // 1 RON per courier-dispatched order
const DUE_DAYS = 5;            // calendar days from Monday to payment due

// ── Helpers ───────────────────────────────────────────────────────────────────

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function fmtRon(bani: number): string {
  return (bani / 100).toFixed(2).replace('.', ',') + ' RON';
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Previous week boundaries in UTC.
// Called on Monday → returns [last Mon 00:00 UTC, last Sun 23:59:59.999 UTC].
function previousWeekUtc(now: Date): { weekStart: Date; weekEnd: Date; thisMonday: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const thisMonday = new Date(Date.UTC(y, m, d)); // today 00:00 UTC (cron fires Mon 03:00)
  const weekStart = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(thisMonday.getTime() - 1); // Sun 23:59:59.999 UTC
  return { weekStart, weekEnd, thisMonday };
}

// ── Data helpers ──────────────────────────────────────────────────────────────

type Tenant = { id: string; name: string };

async function fetchHeadlessTenants(sb: SupabaseClient): Promise<Tenant[]> {
  const { data, error } = await sb
    .from('tenants')
    .select('id, name')
    .eq('delivery_mode', 'headless')
    .eq('status', 'ACTIVE');
  if (error) throw new Error(`tenants fetch: ${error.message}`);
  return (data ?? []) as Tenant[];
}

async function countOrders(
  sb: SupabaseClient,
  tenantId: string,
  from: string,
  to: string,
): Promise<number> {
  const { count, error } = await sb
    .from('restaurant_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'DELIVERED')
    .gte('created_at', from)
    .lte('created_at', to);
  if (error) throw new Error(`order count: ${error.message}`);
  return count ?? 0;
}

async function countCourierOrders(
  sb: SupabaseClient,
  tenantId: string,
  from: string,
  to: string,
): Promise<number> {
  const { count, error } = await sb
    .from('restaurant_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'DELIVERED')
    .gte('created_at', from)
    .lte('created_at', to)
    .not('hir_delivery_id', 'is', null);
  if (error) {
    // Non-fatal — fall back to 0 if column doesn't exist or query fails.
    console.warn('[connect-invoice-weekly] courier count failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

async function getOwnerEmails(sb: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data: members } = await sb
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'OWNER');
  const emails: string[] = [];
  for (const m of members ?? []) {
    const { data: au } = await sb.auth.admin.getUserById((m as { user_id: string }).user_id);
    const email = au?.user?.email;
    if (email) emails.push(email);
  }
  return emails;
}

// ── Email builders ────────────────────────────────────────────────────────────

type InvoiceEmailOpts = {
  tenantName: string;
  weekLabel: string;
  orderCount: number;
  courierOrderCount: number;
  platformFeeBani: number;
  courierFeeBani: number;
  totalBani: number;
  dueDate: string;
  invoiceRef: string; // first 8 chars of invoice id
  adminLink: string;
};

function buildText(o: InvoiceEmailOpts): string {
  const lines = [
    `FACTURĂ HIR CONNECT — ${o.tenantName}`,
    '='.repeat(48),
    '',
    `Perioadă:    ${o.weekLabel}`,
    `Referință:   ${o.invoiceRef}`,
    '',
    'Detaliu:',
    `  Comenzi livrate  ${o.orderCount} × 2,00 RON = ${fmtRon(o.platformFeeBani)}`,
  ];
  if (o.courierOrderCount > 0) {
    lines.push(`  HIR Curier       ${o.courierOrderCount} × 1,00 RON = ${fmtRon(o.courierFeeBani)}`);
  }
  lines.push(`  ${'─'.repeat(44)}`);
  lines.push(`  TOTAL DE PLATĂ   ${fmtRon(o.totalBani)}`);
  lines.push('');
  lines.push(`Termen plată: ${o.dueDate}`);
  lines.push('Plata prin transfer bancar conform contractului HIR Connect.');
  if (o.adminLink) lines.push(`Dashboard:   ${o.adminLink}`);
  lines.push('');
  lines.push('— HIR Restaurant Suite');
  return lines.join('\n');
}

function buildHtml(o: InvoiceEmailOpts): string {
  const courierRow = o.courierOrderCount > 0
    ? `<tr>
        <td style="padding:5px 0;font-size:13px;color:#3f3f46">
          HIR Curier (${o.courierOrderCount}&nbsp;×&nbsp;1,00&nbsp;RON)
        </td>
        <td align="right" style="padding:5px 0;font-size:13px;font-weight:600;color:#18181b;white-space:nowrap">
          ${escapeHtml(fmtRon(o.courierFeeBani))}
        </td>
      </tr>`
    : '';

  const adminCta = o.adminLink
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px">
        <tr>
          <td style="border-radius:9999px;background:#7c3aed">
            <a href="${escapeHtml(o.adminLink)}"
               style="display:inline-block;padding:10px 24px;font-family:Arial,sans-serif;
                      font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;
                      border-radius:9999px">
              Vezi factura în dashboard
            </a>
          </td>
        </tr>
      </table>`
    : '';

  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Factură HIR Connect</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f4f4f5">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" cellpadding="0" cellspacing="0"
                 style="max-width:540px;width:100%;background:#ffffff;border-radius:12px;
                        border:1px solid #e4e4e7;overflow:hidden">

            <!-- Header -->
            <tr>
              <td style="padding:20px 24px;background:#7c3aed;color:#ffffff">
                <p style="margin:0;font-size:11px;letter-spacing:.08em;
                          text-transform:uppercase;opacity:.85">
                  HIR Connect · Factură săptămânală
                </p>
                <p style="margin:4px 0 0;font-size:19px;font-weight:700">
                  ${escapeHtml(o.tenantName)}
                </p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:24px">
                <p style="margin:0 0 4px;font-size:12px;color:#71717a;
                          text-transform:uppercase;letter-spacing:.06em">
                  Perioadă facturată
                </p>
                <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#18181b">
                  ${escapeHtml(o.weekLabel)}
                </p>

                <!-- Line items -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                       style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;
                              padding:8px 0">
                  <tr>
                    <td style="padding:5px 0;font-size:13px;color:#3f3f46">
                      Comenzi livrate (${o.orderCount}&nbsp;×&nbsp;2,00&nbsp;RON)
                    </td>
                    <td align="right" style="padding:5px 0;font-size:13px;font-weight:600;
                                            color:#18181b;white-space:nowrap">
                      ${escapeHtml(fmtRon(o.platformFeeBani))}
                    </td>
                  </tr>
                  ${courierRow}
                  <tr>
                    <td style="padding:10px 0 6px;font-size:15px;font-weight:700;color:#18181b">
                      Total de plată
                    </td>
                    <td align="right" style="padding:10px 0 6px;font-size:18px;
                                            font-weight:700;color:#7c3aed;white-space:nowrap">
                      ${escapeHtml(fmtRon(o.totalBani))}
                    </td>
                  </tr>
                </table>

                <p style="margin:16px 0 4px;font-size:13px;color:#71717a">
                  Termen de plată:
                  <strong style="color:#18181b">${escapeHtml(o.dueDate)}</strong>
                </p>
                <p style="margin:0;font-size:12px;color:#a1a1aa">
                  Plata prin transfer bancar conform contractului HIR Connect.
                </p>

                ${adminCta}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:14px 24px;background:#fafafa;border-top:1px solid #e4e4e7;
                         font-size:11px;color:#a1a1aa;text-align:center">
                HIR Restaurant Suite · Ref:&nbsp;${escapeHtml(o.invoiceRef)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ── HTTP entrypoint ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  return withRunLog('connect-invoice-weekly', async ({ setMetadata }) => {
    // Shared-secret gate (same pattern as every notify-style function).
    const expected = Deno.env.get('HIR_NOTIFY_SECRET');
    if (!expected) {
      console.error('[connect-invoice-weekly] HIR_NOTIFY_SECRET not set');
      return json(500, { error: 'secret_not_configured' });
    }
    const got = req.headers.get('x-hir-notify-secret') ?? '';
    if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
    if (diff !== 0) return json(401, { error: 'unauthorized' });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
    const ADMIN_BASE = (Deno.env.get('ADMIN_BASE_URL') ?? '').replace(/\/$/, '');

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

    // Previous week window (UTC).
    const now = new Date();
    const { weekStart, weekEnd, thisMonday } = previousWeekUtc(now);
    const dueDate = fmtDate(new Date(thisMonday.getTime() + DUE_DAYS * 24 * 60 * 60 * 1000));
    // weekEnd is Sunday 23:59:59 UTC; display the calendar date only.
    const weekEndDay = new Date(weekEnd.getTime() - weekEnd.getUTCMilliseconds());
    weekEndDay.setUTCHours(0, 0, 0, 0);
    const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(weekEndDay)}`;

    console.info('[connect-invoice-weekly] week', weekLabel);

    let tenants: Tenant[];
    try {
      tenants = await fetchHeadlessTenants(sb);
    } catch (e) {
      return json(500, { error: (e as Error).message });
    }

    if (tenants.length === 0) {
      return json(200, { ok: true, invoices_generated: 0, reason: 'no_headless_tenants' });
    }

    const fromUtc = weekStart.toISOString();
    const toUtc = weekEnd.toISOString();

    type Result = {
      tenant_id: string;
      name: string;
      status: string;
      invoice_id?: string;
    };
    const results: Result[] = [];
    let generated = 0;

    for (const tenant of tenants) {
      let orderCount: number;
      try {
        orderCount = await countOrders(sb, tenant.id, fromUtc, toUtc);
      } catch (e) {
        console.error('[connect-invoice-weekly] count error', tenant.id, (e as Error).message);
        results.push({ tenant_id: tenant.id, name: tenant.name, status: 'error_count' });
        continue;
      }

      if (orderCount === 0) {
        results.push({ tenant_id: tenant.id, name: tenant.name, status: 'skipped_no_orders' });
        continue;
      }

      const courierOrderCount = await countCourierOrders(sb, tenant.id, fromUtc, toUtc);
      const platformFeeBani = orderCount * PLATFORM_FEE_BANI;
      const courierFeeBani = courierOrderCount * COURIER_FEE_BANI;
      const totalBani = platformFeeBani + courierFeeBani;

      // Insert invoice row — UNIQUE(tenant_id, week_start) = idempotent.
      const { data: inv, error: insertErr } = await sb
        .from('connect_weekly_invoices')
        .insert({
          tenant_id: tenant.id,
          week_start: weekStart.toISOString(),
          week_end: weekEnd.toISOString(),
          order_count: orderCount,
          courier_order_count: courierOrderCount,
          platform_fee_bani: platformFeeBani,
          courier_fee_bani: courierFeeBani,
          total_bani: totalBani,
          status: 'PENDING',
          due_date: dueDate,
        })
        .select('id')
        .single();

      if (insertErr) {
        if (insertErr.code === '23505') {
          results.push({ tenant_id: tenant.id, name: tenant.name, status: 'duplicate_skipped' });
          continue;
        }
        console.error('[connect-invoice-weekly] insert error', tenant.id, insertErr.message);
        results.push({ tenant_id: tenant.id, name: tenant.name, status: 'error_insert' });
        continue;
      }

      const invoiceId = (inv as { id: string } | null)?.id ?? 'unknown';
      const invoiceRef = invoiceId.slice(0, 8).toUpperCase();
      generated += 1;

      if (!resend) {
        results.push({ tenant_id: tenant.id, name: tenant.name, status: 'created_no_resend', invoice_id: invoiceId });
        continue;
      }

      const recipients = await getOwnerEmails(sb, tenant.id);
      if (recipients.length === 0) {
        results.push({ tenant_id: tenant.id, name: tenant.name, status: 'created_no_recipients', invoice_id: invoiceId });
        continue;
      }

      const adminLink = ADMIN_BASE
        ? `${ADMIN_BASE}/dashboard/connect/invoices/${invoiceId}`
        : '';

      const emailOpts: InvoiceEmailOpts = {
        tenantName: tenant.name,
        weekLabel,
        orderCount,
        courierOrderCount,
        platformFeeBani,
        courierFeeBani,
        totalBani,
        dueDate,
        invoiceRef,
        adminLink,
      };

      const subject = `Factură HIR Connect — Săpt. ${fmtDate(weekStart)}`;
      const text = buildText(emailOpts);
      const html = buildHtml(emailOpts);

      let emailOk = true;
      for (const to of recipients) {
        try {
          const r = await resend.emails.send({ from: FROM, to, subject, text, html });
          if (r.error) {
            console.error('[connect-invoice-weekly] resend error', tenant.id, to, r.error);
            emailOk = false;
          }
        } catch (e) {
          console.error('[connect-invoice-weekly] resend throw', tenant.id, to, String(e));
          emailOk = false;
        }
      }

      results.push({
        tenant_id: tenant.id,
        name: tenant.name,
        status: emailOk ? 'created_email_sent' : 'created_email_partial',
        invoice_id: invoiceId,
      });
    }

    const summary = {
      ok: true,
      week: weekLabel,
      tenants_processed: tenants.length,
      invoices_generated: generated,
      results,
    };
    console.info('[connect-invoice-weekly] done', summary);
    setMetadata({ invoices_generated: generated, tenants_processed: tenants.length });
    return json(200, summary);
  });
});
