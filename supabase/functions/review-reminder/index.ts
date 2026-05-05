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
    const firstName = c.customers.first_name?.trim() || null;
    const greeting = firstName ? `Bună ziua, ${firstName}` : 'Bună ziua';

    const subject = `${tenantName} — cum a fost comanda dumneavoastră?`;
    const text = [
      `${greeting},`,
      '',
      `Sperăm că v-a plăcut ce ați comandat de la ${tenantName}. Lăsați o părere — durează 10 secunde și îi ajută enorm pe ceilalți clienți:`,
      '',
      trackUrl,
      '',
      'Mulțumim,',
      '— HIR · hir.ro',
    ].join('\n');

    const html = renderReviewReminderHtml({
      tenantName,
      greeting,
      trackUrl,
    });

    try {
      const r = await resend.emails.send({
        from: FROM,
        to: c.customers.email,
        subject,
        text,
        html,
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

// Lane N (2026-05-04) — adds HTML alongside the text/* fallback. Same shell
// as notify-customer-status (single column, max-width 560, inline CSS, no
// <style> blocks). Kept inline because Deno Edge Functions can't import from
// the Next.js app's shared lib at compile time.
function renderReviewReminderHtml(opts: {
  tenantName: string;
  greeting: string;
  trackUrl: string;
}): string {
  const accent = '#7c3aed';
  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(opts.tenantName)} — cum a fost comanda?</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#18181b">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${escapeHtml(`Cum a fost comanda dumneavoastră de la ${opts.tenantName}? Lăsați o părere — durează 10 secunde.`)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
            <tr>
              <td align="center" style="padding:20px 24px;border-top:3px solid ${accent};border-bottom:1px solid #f4f4f5">
                <span style="font-size:18px;font-weight:600;color:#18181b">${escapeHtml(opts.tenantName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px">
                <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#18181b">Cum a fost comanda?</h1>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">
                  ${escapeHtml(opts.greeting)},
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#3f3f46">
                  Sperăm că v-a plăcut ce ați comandat de la <strong>${escapeHtml(opts.tenantName)}</strong>.
                  Lăsați o părere — durează 10 secunde și îi ajută enorm pe ceilalți clienți să aleagă.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0">
                  <tr>
                    <td style="border-radius:8px;background:${accent}">
                      <a href="${escapeHtml(opts.trackUrl)}" style="display:inline-block;padding:12px 24px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
                        Lasă o părere
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:8px 0 0;font-size:12px;color:#71717a;line-height:1.5">
                  Sau copiați linkul: <a href="${escapeHtml(opts.trackUrl)}" style="color:#71717a;text-decoration:underline;word-break:break-all">${escapeHtml(opts.trackUrl)}</a>
                </p>
              </td>
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
