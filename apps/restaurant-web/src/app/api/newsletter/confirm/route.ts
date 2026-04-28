import { NextResponse, type NextRequest } from 'next/server';
import { brandingFor, resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/newsletter/resend';
import { welcomeEmail } from '@/lib/newsletter/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubscriberRow = {
  id: string;
  tenant_id: string;
  email: string;
  status: 'PENDING' | 'CONFIRMED' | 'UNSUBSCRIBED' | 'BOUNCED';
  confirmation_token: string;
  unsubscribe_token: string;
  consent_at: string | null;
};

const PROMO_CODE = 'NEWLY10';

// Ensures a tenant-scoped NEWLY10 PERCENT/10 promo exists. Idempotent: if
// the row is already there we reuse it. Per-email usage enforcement is a
// follow-up — the existing promos schema only has a global `max_uses`.
async function ensureWelcomePromo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  tenantId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from('promo_codes')
    .select('id, code')
    .eq('tenant_id', tenantId)
    .eq('code', PROMO_CODE)
    .maybeSingle();
  if (existing) return PROMO_CODE;

  const { error: insErr } = await admin.from('promo_codes').insert({
    tenant_id: tenantId,
    code: PROMO_CODE,
    kind: 'PERCENT',
    value_int: 10,
    min_order_ron: 0,
    max_uses: null,
    is_active: true,
  });
  if (insErr) {
    console.error('[newsletter/confirm] promo insert failed', insErr.message);
  }
  return PROMO_CODE;
}

export async function GET(req: NextRequest) {
  const baseUrl = tenantBaseUrl();
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return NextResponse.redirect(`${baseUrl}/?subscribed=invalid`, 302);
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.redirect(`${baseUrl}/?subscribed=invalid`, 302);
  }

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs = (admin as any).from('newsletter_subscribers');

  const { data: rowRaw, error: lookupErr } = await subs
    .select('id, tenant_id, email, status, confirmation_token, unsubscribe_token, consent_at')
    .eq('tenant_id', tenant.id)
    .eq('confirmation_token', token)
    .maybeSingle();
  if (lookupErr) {
    console.error('[newsletter/confirm] lookup failed', lookupErr.message);
    return NextResponse.redirect(`${baseUrl}/?subscribed=invalid`, 302);
  }
  const row = rowRaw as SubscriberRow | null;
  if (!row) {
    return NextResponse.redirect(`${baseUrl}/?subscribed=invalid`, 302);
  }
  if (row.status === 'UNSUBSCRIBED' || row.status === 'BOUNCED') {
    return NextResponse.redirect(`${baseUrl}/?subscribed=invalid`, 302);
  }

  // Idempotent: re-clicking the link on an already-CONFIRMED row just
  // redirects to the success banner without re-sending the welcome email.
  if (row.status !== 'CONFIRMED') {
    const { error: updErr } = await subs
      .update({
        status: 'CONFIRMED',
        consent_at: row.consent_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (updErr) {
      console.error('[newsletter/confirm] update failed', updErr.message);
      return NextResponse.redirect(`${baseUrl}/?subscribed=invalid`, 302);
    }

    const promoCode = await ensureWelcomePromo(admin, tenant.id);
    const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${encodeURIComponent(row.unsubscribe_token)}`;
    const { logoUrl, brandColor } = brandingFor(tenant.settings);
    const email = welcomeEmail({
      brand: { name: tenant.name, logoUrl, brandColor },
      promoCode,
      unsubscribeUrl,
    });
    const sent = await sendEmail({ to: row.email, subject: email.subject, html: email.html, text: email.text });
    if (!sent.ok) {
      console.error('[newsletter/confirm] welcome email failed', sent.reason, sent.detail);
    }
  }

  return NextResponse.redirect(`${baseUrl}/?subscribed=1`, 302);
}
