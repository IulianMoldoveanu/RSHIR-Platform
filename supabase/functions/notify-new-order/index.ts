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

  const resend = new Resend(RESEND_API_KEY);
  const results: Array<{ to: string; ok: boolean; error?: string }> = [];
  for (const to of recipients) {
    try {
      const r = await resend.emails.send({ from: FROM, to, subject, text });
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
