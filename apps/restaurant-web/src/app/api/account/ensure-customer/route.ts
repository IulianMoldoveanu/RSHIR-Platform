import { NextResponse, type NextRequest } from 'next/server';
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';
import { createServerSupabase } from '@hir/supabase-types';
import { resolveTenantFromHost } from '@/lib/tenant';
import { assertSameOrigin } from '@/lib/origin-check';
import { ensureCustomerForAuthUser } from '@/lib/account/ensure-customer';
import { maybeSetCustomerCookie } from '@/lib/customer-recognition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Called right after email+password signup/login on the client (the OAuth
// callback route does the equivalent server-side for Google). Bridges the
// new Supabase Auth session to the pre-existing customer-recognition cookie
// so every feature already built on that cookie (loyalty, repeat-order,
// order history on /account) keeps working unmodified regardless of which
// login method a customer used.
export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const cookieStore = await cookies();
  const supabase = createServerSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, cookieStore as unknown as UnsafeUnwrappedCookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const ensured = await ensureCustomerForAuthUser({
    tenantId: tenant.id,
    authUserId: user.id,
    email: user.email ?? null,
    fullName:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null,
  });
  if (!ensured.ok) {
    return NextResponse.json({ error: 'ensure_failed', detail: ensured.error }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, customerId: ensured.customerId });
  maybeSetCustomerCookie(res, tenant.id, ensured.customerId);
  return res;
}
