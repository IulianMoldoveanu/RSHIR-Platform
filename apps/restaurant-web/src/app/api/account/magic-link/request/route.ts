import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { brandingFor, resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { issueMagicLink } from '@/lib/account/magic-link';
import { magicLinkEmail } from '@/lib/account/magic-link-email';
import { sendEmail } from '@/lib/newsletter/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
});

export async function POST(req: NextRequest) {
  // IP-level limiter — 3/hour. Capacity 3, refill 1 per 1200 s = 3/h.
  const ip = clientIp(req);
  const ipRl = checkLimit(`magic-link-ip:${ip}`, { capacity: 3, refillPerSec: 1 / 1200 });
  if (!ipRl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfterSec) } },
    );
  }

  // Same-origin gate — third-party pages must not be able to trigger emails.
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  // Per-email limiter — 3/day. Bucket key includes the email so two users
  // on a shared IP don't exhaust each other's allowance.
  const emailRl = checkLimit(`magic-link-email:${email}`, {
    capacity: 3,
    refillPerSec: 1 / 28800, // 3/24h
  });
  if (!emailRl.ok) {
    // Mirror the IP rate limit response — don't leak whether the email is
    // throttled vs. just unknown.
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(emailRl.retryAfterSec) } },
    );
  }

  const admin = getSupabaseAdmin();

  // Look up the most recent customer row for this tenant + email. We always
  // return 200 OK regardless of whether the email matches — it's a privacy
  // guarantee (don't confirm "this email has ordered here") that's standard
  // for password-reset / magic-link flows. The email is only sent when the
  // lookup hits.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (admin as any)
    .from('customers')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (customer) {
    const issued = await issueMagicLink(admin, {
      tenantId: tenant.id,
      customerId: customer.id,
      ip,
    });
    if (issued.ok) {
      const baseUrl = tenantBaseUrl();
      const redeemUrl = `${baseUrl}/account/redeem?token=${encodeURIComponent(issued.rawToken)}`;
      const { logoUrl, brandColor } = brandingFor(tenant.settings);
      const tpl = magicLinkEmail({
        brand: { name: tenant.name, logoUrl, brandColor },
        redeemUrl,
        expiresAtIso: issued.expiresAt.toISOString(),
      });
      const sent = await sendEmail({
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
      if (!sent.ok) {
        console.error('[magic-link/request] email send failed', sent.reason, sent.detail);
      }
    } else if (issued.reason !== 'rate_limited') {
      console.error('[magic-link/request] issue failed', issued.reason);
    }
  }

  // Always 200 — never confirm or deny the email lookup.
  return NextResponse.json({ ok: true });
}
