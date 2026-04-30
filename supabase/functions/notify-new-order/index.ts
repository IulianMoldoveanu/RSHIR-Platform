// RSHIR-18 — order-paid email notification.
//
// Triggered by the AFTER UPDATE OF payment_status trigger on
// public.restaurant_orders (see 20260427_510_order_email_trigger.sql).
// pg_net.http_post fires this with body { order_id, tenant_id }; we look up
// the order + OWNER members and send each one a Resend email.
//
// Decoupled from apps/restaurant-web/src/app/api/checkout/order-finalize.ts
// (RSHIR-17) on purpose: the trigger fires once on the PAID transition,
// regardless of which code path flipped it (Stripe webhook, manual SQL, etc).
//
// Env (set as Supabase function secrets via Management API or `supabase
// secrets set`):
//   HIR_NOTIFY_SECRET      — shared secret enforced on every request
//                            (RSHIR-22). The DB trigger sends it as the
//                            `x-hir-notify-secret` header; mismatch ⇒ 401
//                            before any DB read.
//   RESEND_API_KEY         — Resend API key (re_...).
//   RESEND_FROM_EMAIL      — sender. Until hir.ro is verified, use
//                            onboarding@resend.dev.
//   ADMIN_BASE_URL         — base URL of restaurant-admin (e.g.
//                            https://admin.hir.ro). Used to deep-link
//                            into /dashboard/orders/<id>.
//   RESTAURANT_WEB_URL     — base URL of the storefront, used to build the
//                            public /track/<token> link.
// Auto-injected by Supabase Edge runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Resend } from 'https://esm.sh/resend@4.0.1';

type Body = { order_id: string; tenant_id: string };

type OrderItem = {
  name?: string;
  qty?: number;
  quantity?: number;
  price_ron?: number;
  unit_price_ron?: number;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function lastInitial(s: string | null | undefined): string {
  if (!s) return '';
  const c = s.trim().charAt(0);
  return c ? `${c.toUpperCase()}.` : '';
}

function fmtRon(n: number | string | null | undefined): string {
  return `${Number(n ?? 0).toFixed(2)} RON`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function renderItems(items: unknown): string {
  if (!Array.isArray(items)) return '(fără detalii articole)';
  return (items as OrderItem[])
    .map((it) => {
      const qty = it.qty ?? it.quantity ?? 1;
      const price = it.unit_price_ron ?? it.price_ron ?? 0;
      const name = it.name ?? '(articol)';
      return `  • ${qty} × ${name} — ${fmtRon(Number(price) * Number(qty))}`;
    })
    .join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // RSHIR-22: shared-secret gate. Reject before any DB work so the URL
  // alone is not enough to invoke. Constant-time compare avoids leaking
  // the secret length via response timing.
  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) {
    console.error('[notify-new-order] HIR_NOTIFY_SECRET not configured');
    return json(500, { error: 'secret_not_configured' });
  }
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return json(401, { error: 'unauthorized' });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!isUuid(body.order_id) || !isUuid(body.tenant_id)) {
    return json(400, { error: 'invalid_body' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
  const ADMIN_BASE = (Deno.env.get('ADMIN_BASE_URL') ?? '').replace(/\/$/, '');
  const WEB_BASE = (Deno.env.get('RESTAURANT_WEB_URL') ?? '').replace(/\/$/, '');

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'supabase_env_missing' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Tenant + opt-out flag — checked first so opt-out short-circuits even
  // when Resend is not yet configured.
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, settings')
    .eq('id', body.tenant_id)
    .maybeSingle();
  if (tenantErr || !tenant) {
    if (tenantErr) console.error('[notify-new-order] tenant lookup failed:', tenantErr.message);
    return json(404, { error: 'tenant_not_found' });
  }
  const optedOut =
    (tenant.settings as Record<string, unknown> | null)?.email_notifications_enabled === false;
  if (optedOut) {
    return json(200, { ok: true, skipped: 'opted_out' });
  }

  if (!RESEND_API_KEY) {
    console.error('[notify-new-order] RESEND_API_KEY not configured');
    return json(500, { error: 'resend_not_configured' });
  }

  // Order.
  const { data: order, error: orderErr } = await supabase
    .from('restaurant_orders')
    .select(
      `id, tenant_id, status, payment_status, items, total_ron, public_track_token,
       customers ( first_name, last_name )`,
    )
    .eq('id', body.order_id)
    .eq('tenant_id', body.tenant_id)
    .maybeSingle();
  if (orderErr || !order) {
    if (orderErr) console.error('[notify-new-order] order lookup failed:', orderErr.message);
    return json(404, { error: 'order_not_found' });
  }
  if (order.payment_status !== 'PAID') {
    // Trigger guarantees this, but stay defensive.
    return json(200, { ok: true, skipped: 'not_paid' });
  }

  // OWNER members → email addresses (auth.users.email).
  const { data: members, error: memErr } = await supabase
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', body.tenant_id)
    .eq('role', 'OWNER');
  if (memErr) {
    console.error('[notify-new-order] members query failed:', memErr.message);
    return json(500, { error: 'members_query_failed' });
  }
  const recipients: string[] = [];
  for (const m of members ?? []) {
    const { data: au } = await supabase.auth.admin.getUserById(m.user_id);
    const email = au?.user?.email;
    if (email) recipients.push(email);
  }
  if (recipients.length === 0) {
    return json(200, { ok: true, skipped: 'no_owner_emails' });
  }

  const customer = (order.customers ?? null) as
    | { first_name: string | null; last_name: string | null }
    | null;
  const customerLabel = `${customer?.first_name ?? 'Client'} ${lastInitial(customer?.last_name)}`.trim();
  const adminLink = ADMIN_BASE
    ? `${ADMIN_BASE}/dashboard/orders/${order.id}`
    : `(setează ADMIN_BASE_URL — ID comandă: ${order.id})`;
  const trackLink = WEB_BASE
    ? `${WEB_BASE}/track/${order.public_track_token}`
    : '(link tracking indisponibil)';

  const subject = `Comandă nouă — ${tenant.name}`;
  const text = [
    `Ai o comandă nouă plătită (#${shortId(order.id)}).`,
    '',
    `Client: ${customerLabel}`,
    `Total: ${fmtRon(order.total_ron)}`,
    '',
    'Articole:',
    renderItems(order.items),
    '',
    `Detalii (admin): ${adminLink}`,
    `Tracking client: ${trackLink}`,
    '',
    '— HIR Restaurant Suite',
  ].join('\n');

  const html = renderNewOrderHtml({
    tenantName: tenant.name,
    orderShortId: shortId(order.id),
    customerLabel,
    totalRon: fmtRon(order.total_ron),
    items: order.items,
    adminLink: ADMIN_BASE ? adminLink : undefined,
    trackLink: WEB_BASE ? trackLink : undefined,
  });

  const resend = new Resend(RESEND_API_KEY);
  const results: Array<{ to: string; ok: boolean; error?: string }> = [];
  for (const to of recipients) {
    try {
      const r = await resend.emails.send({ from: FROM, to, subject, text, html });
      if (r.error) {
        console.error('[notify-new-order] resend error', to, r.error);
        results.push({ to, ok: false, error: r.error.message });
      } else {
        results.push({ to, ok: true });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[notify-new-order] resend throw', to, msg);
      results.push({ to, ok: false, error: msg });
    }
  }

  return json(200, { ok: true, sent: results });
});

// HTML new-order alert sent to restaurant owners. Same email-client compat
// approach as notify-customer-status: inline CSS, table layout, <5KB.
function renderNewOrderHtml(opts: {
  tenantName: string;
  orderShortId: string;
  customerLabel: string;
  totalRon: string;
  items: unknown;
  adminLink?: string;
  trackLink?: string;
}): string {
  const itemRows = (() => {
    const arr = Array.isArray(opts.items) ? opts.items : [];
    if (arr.length === 0) {
      return '<tr><td style="padding:6px 0;color:#a1a1aa;font-size:13px">(fără detalii produs)</td></tr>';
    }
    return arr
      .map((raw) => {
        const it = (raw ?? {}) as { name?: unknown; quantity?: unknown; qty?: unknown };
        const name = typeof it.name === 'string' ? it.name : '(produs)';
        const qty = typeof it.quantity === 'number'
          ? it.quantity
          : typeof it.qty === 'number'
            ? it.qty
            : 1;
        return `<tr>
          <td style="padding:4px 0;font-size:13px;color:#3f3f46">${escapeHtmlNo(name)}</td>
          <td align="right" style="padding:4px 0;font-size:13px;font-weight:600;color:#18181b;white-space:nowrap">×${qty}</td>
        </tr>`;
      })
      .join('');
  })();

  const adminCta = opts.adminLink
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px">
         <tr>
           <td style="border-radius:9999px;background:#7c3aed">
             <a href="${escapeHtmlNo(opts.adminLink)}"
                style="display:inline-block;padding:10px 22px;font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9999px">
               Deschide în admin
             </a>
           </td>
         </tr>
       </table>`
    : '';
  const trackRow = opts.trackLink
    ? `<p style="margin:8px 0 0;font-size:12px;color:#71717a">Tracking client: <a href="${escapeHtmlNo(opts.trackLink)}" style="color:#7c3aed;text-decoration:none">deschide</a></p>`
    : '';

  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Comandă nouă — ${escapeHtmlNo(opts.tenantName)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
            <tr>
              <td style="padding:20px 24px;background:#10b981;color:#ffffff">
                <p style="margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.9">Comandă plătită · #${escapeHtmlNo(opts.orderShortId)}</p>
                <p style="margin:4px 0 0;font-size:18px;font-weight:600">${escapeHtmlNo(opts.tenantName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px">
                <p style="margin:0 0 12px;font-size:15px;line-height:1.45;color:#3f3f46">
                  Ai o comandă nouă de la <strong>${escapeHtmlNo(opts.customerLabel)}</strong>.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;padding:8px 0;margin:8px 0">
                  ${itemRows}
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px">
                  <tr>
                    <td style="font-size:13px;color:#71717a">Total comandă</td>
                    <td align="right" style="font-size:16px;font-weight:700;color:#18181b">${escapeHtmlNo(opts.totalRon)}</td>
                  </tr>
                </table>
                ${adminCta}
                ${trackRow}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;text-align:center">
                HIR Restaurant Suite — venitul rămâne la tine, fără comision agregator.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtmlNo(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
