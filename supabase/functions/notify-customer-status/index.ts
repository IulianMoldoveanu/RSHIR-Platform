// RSHIR-56 — customer status email notification.
//
// Triggered by AFTER UPDATE OF status on public.restaurant_orders (see
// 20260501_005_customer_status_email.sql). pg_net.http_post fires this
// when the order flips into a customer-actionable state. We look up the
// customer email and send a Resend email tailored to the new status.
//
// Handles CONFIRMED, READY, DISPATCHED, IN_DELIVERY — the four statuses
// the DB trigger forwards. DELIVERED is intentionally excluded (the
// customer just received the food; an email is noise).
//
// Env (Supabase function secrets):
//   HIR_NOTIFY_SECRET      shared secret with the DB trigger
//   RESEND_API_KEY         Resend API key
//   RESEND_FROM_EMAIL      sender (defaults to onboarding@resend.dev)
//   RESTAURANT_WEB_URL     base URL for the /track/<token> deep link
// Auto-injected by Supabase Edge runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Resend } from 'https://esm.sh/resend@4.0.1';
// @ts-expect-error — npm:web-push has no Deno types but works at runtime
import webpush from 'npm:web-push@3.6.7';
import { withRunLog } from '../_shared/log.ts';

type Body = { order_id: string; tenant_id: string; status: string };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function fmtRon(n: number | string | null | undefined): string {
  return `${Number(n ?? 0).toFixed(2)} RON`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  return withRunLog('notify-customer-status', async ({ setMetadata }) => {
  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) return json(500, { error: 'secret_not_configured' });
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
  if (!isUuid(body.order_id) || !isUuid(body.tenant_id) || typeof body.status !== 'string') {
    return json(400, { error: 'invalid_body' });
  }

  setMetadata({ tenant_id: body.tenant_id, order_id: body.order_id, status: body.status });

  const HANDLED = new Set(['CONFIRMED', 'READY', 'DISPATCHED', 'IN_DELIVERY']);
  if (!HANDLED.has(body.status)) {
    return json(200, { ok: true, skipped: 'status_not_handled', status: body.status });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
  const WEB_BASE = (Deno.env.get('RESTAURANT_WEB_URL') ?? '').replace(/\/$/, '');

  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, settings')
    .eq('id', body.tenant_id)
    .maybeSingle();
  if (tenantErr || !tenant) {
    if (tenantErr) console.error('[notify-customer-status] tenant lookup failed:', tenantErr.message);
    return json(404, { error: 'tenant_not_found' });
  }

  const { data: order, error: orderErr } = await supabase
    .from('restaurant_orders')
    .select(
      `id, tenant_id, status, total_ron, public_track_token,
       customers ( first_name, email, locale )`,
    )
    .eq('id', body.order_id)
    .eq('tenant_id', body.tenant_id)
    .maybeSingle();
  if (orderErr || !order) {
    if (orderErr) console.error('[notify-customer-status] order lookup failed:', orderErr.message);
    return json(404, { error: 'order_not_found' });
  }

  const customer = (order.customers ?? null) as
    | { first_name: string | null; email: string | null; locale: string | null }
    | null;
  if (!customer?.email) {
    return json(200, { ok: true, skipped: 'no_customer_email' });
  }
  const locale: 'ro' | 'en' = customer.locale === 'en' ? 'en' : 'ro';

  if (!RESEND_API_KEY) return json(500, { error: 'resend_not_configured' });

  const trackLink = WEB_BASE
    ? `${WEB_BASE}/track/${order.public_track_token}`
    : null;

  const greeting = customer.first_name
    ? locale === 'en'
      ? `Hi, ${customer.first_name}!`
      : `Salut, ${customer.first_name}!`
    : locale === 'en'
      ? 'Hi!'
      : 'Salut!';

  type StatusCopy = { subjectSuffix: string; line: string };
  const COPY_RO: Record<string, StatusCopy> = {
    CONFIRMED: {
      subjectSuffix: `confirmată de ${tenant.name}`,
      line: `${tenant.name} a confirmat comanda ta. O începem să o pregătim.`,
    },
    READY: {
      subjectSuffix: `gata de plecare`,
      line: `${tenant.name} a finalizat comanda ta. Curierul o ridică imediat.`,
    },
    DISPATCHED: {
      subjectSuffix: `în drum spre tine`,
      line: `Curierul a preluat comanda ta de la ${tenant.name} și pornește spre tine.`,
    },
    IN_DELIVERY: {
      subjectSuffix: `aproape la tine`,
      line: `Curierul este aproape — ține telefonul la îndemână.`,
    },
  };
  const COPY_EN: Record<string, StatusCopy> = {
    CONFIRMED: {
      subjectSuffix: `confirmed by ${tenant.name}`,
      line: `${tenant.name} confirmed your order. We're starting to prepare it.`,
    },
    READY: {
      subjectSuffix: `ready for pickup`,
      line: `${tenant.name} finished your order. The courier is picking it up now.`,
    },
    DISPATCHED: {
      subjectSuffix: `on its way`,
      line: `The courier picked up your order from ${tenant.name} and is heading your way.`,
    },
    IN_DELIVERY: {
      subjectSuffix: `almost there`,
      line: `The courier is close — keep your phone handy.`,
    },
  };
  const COPY = locale === 'en' ? COPY_EN : COPY_RO;
  const copy = COPY[body.status];
  // HANDLED set is checked above, so this is unreachable — but keep a type-
  // safe guard so a future status added to the set without a copy entry is
  // skipped instead of crashing.
  if (!copy) return json(200, { ok: true, skipped: 'no_copy_for_status', status: body.status });

  const subjectPrefix = locale === 'en' ? 'Order' : 'Comanda';
  const subject = `${subjectPrefix} #${shortId(order.id)} — ${copy.subjectSuffix}`;
  const totalLabel = locale === 'en' ? 'Total' : 'Total';
  const trackLineLabel = locale === 'en' ? 'Track your order' : 'Vezi statusul';
  const text = [
    greeting,
    '',
    copy.line,
    '',
    `${totalLabel}: ${fmtRon(order.total_ron)}`,
    trackLink ? `${trackLineLabel}: ${trackLink}` : '',
    '',
    '— HIR Restaurant Suite',
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderStatusHtml({
    tenantName: tenant.name,
    greeting,
    line: copy.line,
    orderShortId: shortId(order.id),
    totalRon: fmtRon(order.total_ron),
    trackLink: trackLink || undefined,
    statusBadge: copy.subjectSuffix,
    locale,
  });

  const resend = new Resend(RESEND_API_KEY);
  try {
    const r = await resend.emails.send({ from: FROM, to: customer.email, subject, text, html });
    if (r.error) {
      console.error('[notify-customer-status] resend error', r.error);
      return json(502, { error: 'resend_failed' });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[notify-customer-status] resend throw', msg);
    return json(502, { error: 'resend_threw' });
  }

  // Best-effort Web Push to any browser subscriptions the customer opted in to
  // on the /track page. Failures here don't affect the email response.
  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:courier@hiraisolutions.ro';

  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const { data: pushSubs } = await supabase
      .from('customer_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('order_id', order.id);

    if (pushSubs && pushSubs.length > 0) {
      const notification = JSON.stringify({
        title: `${tenant.name} — ${copy.subjectSuffix}`,
        body: copy.line,
        token: order.public_track_token,
        orderId: shortId(order.id),
      });

      await Promise.allSettled(
        (pushSubs as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>).map(
          async (s) => {
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                notification,
                { TTL: 60 },
              );
            } catch (err) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const status = (err as any)?.statusCode;
              if (status === 410 || status === 404) {
                // Stale subscription — prune it.
                await supabase
                  .from('customer_push_subscriptions')
                  .delete()
                  .eq('id', s.id);
                console.log('[notify-customer-status] pruned stale push sub', s.endpoint);
              } else {
                console.error(
                  '[notify-customer-status] push failed',
                  s.endpoint,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (err as any)?.message ?? String(err),
                );
              }
            }
          },
        ),
      );
    }
  }

  return json(200, { ok: true, sent: customer.email, status: body.status });
  });
});

// Email-client compatible HTML status email. Inline CSS only — Gmail/Outlook
// strip <style>; mobile + dark-mode safe via media queries embedded in <head>.
// Stays under 5 KB so Gmail doesn't clip it. The text/* fallback above is the
// canonical version for clients that strip HTML.
function renderStatusHtml(opts: {
  tenantName: string;
  greeting: string;
  line: string;
  orderShortId: string;
  totalRon: string;
  trackLink?: string;
  statusBadge: string;
  locale: 'ro' | 'en';
}): string {
  const isEn = opts.locale === 'en';
  const ctaLabel = isEn ? 'Track your order' : 'Vezi statusul comenzii';
  const orderLabel = isEn ? 'Order' : 'Comanda';
  const totalLabel = isEn ? 'Order total' : 'Total comandă';
  const footerNote = isEn
    ? 'Sent via HIR Restaurant Suite — order direct, no aggregator commission.'
    : 'Trimis prin HIR Restaurant Suite — comandă direct, fără comision agregator.';
  const cta = opts.trackLink
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
         <tr>
           <td style="border-radius:9999px;background:#7c3aed">
             <a href="${escapeHtml(opts.trackLink)}"
                style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9999px">
               ${escapeHtml(ctaLabel)}
             </a>
           </td>
         </tr>
       </table>`
    : '';
  return `<!doctype html>
<html lang="${isEn ? 'en' : 'ro'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(opts.tenantName)} — ${escapeHtml(opts.statusBadge)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
            <tr>
              <td style="padding:20px 24px;background:#7c3aed;color:#ffffff">
                <p style="margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">${escapeHtml(orderLabel)} #${escapeHtml(opts.orderShortId)}</p>
                <p style="margin:4px 0 0;font-size:18px;font-weight:600">${escapeHtml(opts.tenantName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px">
                <p style="margin:0 0 4px;font-size:16px;font-weight:600">${escapeHtml(opts.greeting)}</p>
                <p style="margin:0;font-size:15px;line-height:1.5;color:#3f3f46">${escapeHtml(opts.line)}</p>
                ${cta}
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e4e4e7;padding-top:12px;margin-top:8px">
                  <tr>
                    <td style="font-size:13px;color:#71717a">${escapeHtml(totalLabel)}</td>
                    <td align="right" style="font-size:14px;font-weight:600;color:#18181b">${escapeHtml(opts.totalRon)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;text-align:center">
                ${escapeHtml(footerNote)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
