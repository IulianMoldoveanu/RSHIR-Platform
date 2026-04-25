// RSHIR-43 — review reminder email.
//
// Triggered by the `review-reminder` pg_cron job at :15 every hour.
// Looks for orders that:
//   - status = 'DELIVERED'
//   - payment_status = 'PAID'
//   - updated_at in [now-30h, now-24h]
//   - have NO row in restaurant_reviews
//   - have NO review_reminder_sent_at yet
//   - have a customer with a non-null email
// For each match, sends a one-click reminder email with the existing
// /track/<token> link (the same page already shows the review widget
// once the order is DELIVERED) and stamps review_reminder_sent_at so
// the next cron tick won't double-fire.
//
// Auth: same shared-secret model as notify-new-order / daily-digest.
//   HIR_NOTIFY_SECRET — required, sent by pg_net as `x-hir-notify-secret`.
//
// Env (Supabase function secrets):
//   RESEND_API_KEY                  — Resend API key.
//   RESEND_FROM_EMAIL               — sender (default onboarding@resend.dev).
//   NEXT_PUBLIC_RESTAURANT_WEB_URL  — storefront base, e.g. https://hir.ro.
// Auto-injected:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Resend } from 'https://esm.sh/resend@4.0.1';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type Candidate = {
  id: string;
  tenant_id: string;
  public_track_token: string;
  customer_id: string | null;
  customers: { email: string | null; first_name: string | null } | null;
  tenants: { name: string } | null;
};

async function findCandidates(supabase: SupabaseClient): Promise<Candidate[]> {
  const now = Date.now();
  const startIso = new Date(now - 30 * 60 * 60 * 1000).toISOString();
  const endIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // Pull a wide net first; the join + the no-review filter are applied
  // client-side here. A single tick should never exceed a few dozen orders
  // for the pilot, so this is fine.
  const { data, error } = await supabase
    .from('restaurant_orders')
    .select(`
      id,
      tenant_id,
      public_track_token,
      customer_id,
      customers ( email, first_name ),
      tenants ( name )
    `)
    .eq('status', 'DELIVERED')
    .eq('payment_status', 'PAID')
    .gte('updated_at', startIso)
    .lt('updated_at', endIso)
    .is('review_reminder_sent_at', null);
  if (error) {
    console.error('[review-reminder] orders query error', error.message);
    return [];
  }
  return (data ?? []) as unknown as Candidate[];
}

async function alreadyReviewed(supabase: SupabaseClient, orderId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('restaurant_reviews')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) {
    console.error('[review-reminder] HIR_NOTIFY_SECRET not configured');
    return json(500, { error: 'secret_not_configured' });
  }
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return json(401, { error: 'unauthorized' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
  const WEB_BASE = Deno.env.get('NEXT_PUBLIC_RESTAURANT_WEB_URL') ?? '';
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'supabase_env_missing' });
  }
  if (!RESEND_API_KEY) {
    return json(500, { error: 'resend_not_configured' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const resend = new Resend(RESEND_API_KEY);

  const candidates = await findCandidates(supabase);
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const c of candidates) {
    if (!c.customers?.email) {
      skipped += 1;
      continue;
    }
    if (await alreadyReviewed(supabase, c.id)) {
      // Stamp anyway so we stop checking this order on every tick.
      await supabase
        .from('restaurant_orders')
        .update({ review_reminder_sent_at: new Date().toISOString() })
        .eq('id', c.id);
      skipped += 1;
      continue;
    }

    const trackUrl = WEB_BASE
      ? `${WEB_BASE.replace(/\/$/, '')}/track/${c.public_track_token}`
      : `/track/${c.public_track_token}`;
    const tenantName = c.tenants?.name ?? 'restaurant';
    const firstName = c.customers.first_name?.trim() || 'salut';

    const subject = `${tenantName} — cum a fost comanda ta?`;
    const text = [
      `Bună, ${firstName}!`,
      '',
      `Speram că ți-a plăcut ce ai comandat de la ${tenantName}. Lasă-le o părere — durează 10 secunde și îi ajută enorm:`,
      '',
      trackUrl,
      '',
      'Mulțumim,',
      '— HIR',
    ].join('\n');

    try {
      const r = await resend.emails.send({
        from: FROM,
        to: c.customers.email,
        subject,
        text,
      });
      if (r.error) {
        console.error('[review-reminder] resend error', c.id, r.error);
        errors += 1;
        continue;
      }
    } catch (e) {
      console.error('[review-reminder] resend throw', c.id, e);
      errors += 1;
      continue;
    }

    const { error: stampErr } = await supabase
      .from('restaurant_orders')
      .update({ review_reminder_sent_at: new Date().toISOString() })
      .eq('id', c.id);
    if (stampErr) {
      console.error('[review-reminder] stamp error', c.id, stampErr.message);
      errors += 1;
      continue;
    }
    sent += 1;
  }

  return json(200, { ok: true, candidates: candidates.length, sent, skipped, errors });
});
