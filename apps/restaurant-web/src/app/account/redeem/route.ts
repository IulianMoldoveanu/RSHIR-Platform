import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { redeemMagicLink } from '@/lib/account/magic-link';
import {
  CUSTOMER_COOKIE_MAX_AGE_SECONDS,
  customerCookieName,
} from '@/lib/customer-recognition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lane L PR 2 — magic-link redeem endpoint.
//
// GET /account/redeem?token=<64 hex>
//   * resolves the tenant via host
//   * looks up the (hashed) token in magic_link_tokens for this tenant
//   * validates expiry + single-use
//   * sets the existing customer recognition cookie (httpOnly, 180 days —
//     this is the same cookie the rest of the storefront uses for prefill +
//     loyalty + /account)
//   * redirects to /account WITH NO TOKEN IN THE URL — the raw token never
//     hits the storefront page, never lands in browser history beyond this
//     redeem hop. /account is then read-only via the cookie.
//
// Failure UX: redirect to /?account=<reason> so the storefront can show a
// friendly toast. Reasons: invalid, expired, already_used.

export async function GET(req: NextRequest) {
  const baseUrl = tenantBaseUrl();
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.redirect(`${baseUrl}/?account=invalid`, 302);
  }

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return NextResponse.redirect(`${baseUrl}/?account=invalid`, 302);
  }

  const admin = getSupabaseAdmin();
  const result = await redeemMagicLink(admin, { tenantId: tenant.id, rawToken: token });
  if (!result.ok) {
    const reason =
      result.reason === 'expired'
        ? 'expired'
        : result.reason === 'already_used'
          ? 'already_used'
          : 'invalid';
    return NextResponse.redirect(`${baseUrl}/?account=${reason}`, 302);
  }

  // Redirect to /account with the magic-link cookie set. We use the EXISTING
  // hir-customer-<tenantId> cookie name (not a new "session" cookie) because
  // the rest of the storefront — checkout prefill, loyalty balance, /account
  // page — already reads that cookie. This means a successful redeem +
  // a brand-new browser is functionally identical to "you've ordered here
  // before", and Just Works.
  const res = NextResponse.redirect(`${baseUrl}/account?welcome=1`, 302);
  res.cookies.set({
    name: customerCookieName(tenant.id),
    value: result.customerId,
    maxAge: CUSTOMER_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    path: '/',
  });
  return res;
}
