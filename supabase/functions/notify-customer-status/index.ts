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
       customers ( first_name, email )`,
    )
    .eq('id', body.order_id)
    .eq('tenant_id', body.tenant_id)
    .maybeSingle();
  if (orderErr || !order) {
    if (orderErr) console.error('[notify-customer-status] order lookup failed:', orderErr.message);
    return json(404, { error: 'order_not_found' });
  }

  const customer = (order.customers ?? null) as
    | { first_name: string | null; email: string | null }
    | null;
  if (!customer?.email) {
    return json(200, { ok: true, skipped: 'no_customer_email' });
  }

  if (!RESEND_API_KEY) return json(500, { error: 'resend_not_configured' });

  const trackLink = WEB_BASE
    ? `${WEB_BASE}/track/${order.public_track_token}`
    : null;

  const greeting = customer.first_name
    ? `Salut, ${customer.first_name}!`
    : 'Salut!';

  const COPY: Record<string, { subjectSuffix: string; line: string }> = {
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
  const copy = COPY[body.status];
  // HANDLED set is checked above, so this is unreachable — but keep a type-
  // safe guard so a future status added to the set without a copy entry is
  // skipped instead of crashing.
  if (!copy) return json(200, { ok: true, skipped: 'no_copy_for_status', status: body.status });

  const subject = `Comanda #${shortId(order.id)} — ${copy.subjectSuffix}`;
  const text = [
    greeting,
    '',
    copy.line,
    '',
    `Total: ${fmtRon(order.total_ron)}`,
    trackLink ? `Vezi statusul: ${trackLink}` : '',
    '',
    '— HIR Restaurant Suite',
  ]
    .filter(Boolean)
    .join('\n');

  const resend = new Resend(RESEND_API_KEY);
  try {
    const r = await resend.emails.send({ from: FROM, to: customer.email, subject, text });
    if (r.error) {
      console.error('[notify-customer-status] resend error', r.error);
      return json(502, { error: 'resend_failed' });
    }
    return json(200, { ok: true, sent: customer.email, status: body.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[notify-customer-status] resend throw', msg);
    return json(502, { error: 'resend_threw' });
  }
});
