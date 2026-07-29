import { NextResponse, type NextRequest } from 'next/server';
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';
import { createServerSupabase } from '@hir/supabase-types';
import { resolveTenantFromHost } from '@/lib/tenant';
import { ensureCustomerForAuthUser } from '@/lib/account/ensure-customer';
import { maybeSetCustomerCookie } from '@/lib/customer-recognition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// OAuth (Google today, Facebook/Apple as they're wired up) redirect target.
// signInWithOAuth() on the client sends the browser to the provider, which
// redirects back here with a `code` param — exchange it for a session
// (sets the Supabase auth cookies on this response), then make sure a
// customers row exists for THIS tenant linked to the new auth identity
// before sending the visitor back to their account page.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const redirectTo = req.nextUrl.searchParams.get('next');
  const safeNext = redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/account';

  if (!code) {
    return NextResponse.redirect(new URL('/account?auth_error=missing_code', req.url));
  }

  const cookieStore = await cookies();
  const supabase = createServerSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, cookieStore as unknown as UnsafeUnwrappedCookies);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error('[auth/callback] exchangeCodeForSession failed', error?.message);
    return NextResponse.redirect(new URL('/account?auth_error=exchange_failed', req.url));
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.redirect(new URL('/account?auth_error=tenant_not_found', req.url));
  }

  const ensured = await ensureCustomerForAuthUser({
    tenantId: tenant.id,
    authUserId: data.user.id,
    email: data.user.email ?? null,
    fullName:
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      null,
  });

  const res = NextResponse.redirect(new URL(safeNext, req.url));
  if (ensured.ok) {
    // Bridges the new auth session to the pre-existing customer-recognition
    // cookie so loyalty/repeat-order/order-history keep working unmodified
    // regardless of login method.
    maybeSetCustomerCookie(res, tenant.id, ensured.customerId);
  } else {
    console.error('[auth/callback] ensureCustomerForAuthUser failed', ensured.error);
    // Session is still valid even if the customer-row link failed — don't
    // strand the user on an error page for what's likely a transient DB
    // hiccup; /account calls /api/account/ensure-customer again on load.
  }
  return res;
}
