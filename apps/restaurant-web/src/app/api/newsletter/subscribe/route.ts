import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { brandingFor, resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/newsletter/resend';
import { confirmationEmail } from '@/lib/newsletter/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Subscribers row shape — types package not yet regenerated for the new
// table, so we model it locally and cast at the from('newsletter_subscribers')
// boundary. Drop these once `pnpm --filter @hir/supabase-types gen` runs.
type SubscriberRow = {
  id: string;
  tenant_id: string;
  email: string;
  status: 'PENDING' | 'CONFIRMED' | 'UNSUBSCRIBED' | 'BOUNCED';
  confirmation_token: string;
  unsubscribe_token: string;
  consent_at: string | null;
  source: string;
};

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  consent: z.literal(true),
});

function newToken(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  // 5/min per IP — popup is one-shot, generous cap covers typo retries.
  const rl = checkLimit(`newsletter-subscribe:${clientIp(req)}`, {
    capacity: 5,
    refillPerSec: 5 / 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs = (admin as any).from('newsletter_subscribers');

  const { data: existingRaw, error: lookupErr } = await subs
    .select('id, tenant_id, email, status, confirmation_token, unsubscribe_token, consent_at, source')
    .eq('tenant_id', tenant.id)
    .eq('email', parsed.data.email)
    .maybeSingle();
  if (lookupErr) {
    console.error('[newsletter/subscribe] lookup failed', lookupErr.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  const existing = existingRaw as SubscriberRow | null;

  // Already-confirmed subscriber: friendly response, no email re-send.
  if (existing && existing.status === 'CONFIRMED') {
    return NextResponse.json({ ok: true, status: 'already_subscribed' });
  }

  let row: SubscriberRow;
  if (existing) {
    // Refresh tokens + reset to PENDING (covers UNSUBSCRIBED → re-opt-in
    // and stale PENDING tokens). consent_at refreshed since the user just
    // ticked the checkbox again.
    const confirmation_token = newToken();
    const unsubscribe_token = newToken();
    const { data: updated, error: updErr } = await subs
      .update({
        status: 'PENDING',
        confirmation_token,
        unsubscribe_token,
        consent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id, tenant_id, email, status, confirmation_token, unsubscribe_token, consent_at, source')
      .single();
    if (updErr || !updated) {
      console.error('[newsletter/subscribe] update failed', updErr?.message);
      return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    }
    row = updated as SubscriberRow;
  } else {
    const { data: inserted, error: insErr } = await subs
      .insert({
        tenant_id: tenant.id,
        email: parsed.data.email,
        status: 'PENDING',
        confirmation_token: newToken(),
        unsubscribe_token: newToken(),
        consent_at: new Date().toISOString(),
        source: 'storefront-popup',
      })
      .select('id, tenant_id, email, status, confirmation_token, unsubscribe_token, consent_at, source')
      .single();
    if (insErr || !inserted) {
      console.error('[newsletter/subscribe] insert failed', insErr?.message);
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
    }
    row = inserted as SubscriberRow;
  }

  const baseUrl = tenantBaseUrl();
  const confirmUrl = `${baseUrl}/api/newsletter/confirm?token=${encodeURIComponent(row.confirmation_token)}`;
  const { logoUrl, brandColor } = brandingFor(tenant.settings);
  const email = confirmationEmail({
    brand: { name: tenant.name, logoUrl, brandColor },
    confirmUrl,
  });
  const sent = await sendEmail({ to: row.email, subject: email.subject, html: email.html, text: email.text });
  if (!sent.ok) {
    // Log but don't fail the user — they're already in the DB; we can resend.
    console.error('[newsletter/subscribe] resend failed', sent.reason, sent.detail);
  }

  return NextResponse.json({ ok: true, status: 'pending' });
}
