import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantFromHost } from '@/lib/tenant';
import { assertSameOrigin } from '@/lib/origin-check';
import { customerCookieName } from '@/lib/customer-recognition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Clears the httpOnly customer-recognition cookie for this tenant. The
// Supabase Auth session itself is cleared client-side (supabase.auth.
// signOut() manages its own cookies) — this only handles the separate
// legacy recognition cookie that auth login/signup also sets, so a signed-
// out visitor doesn't keep looking "recognized" by the old mechanism.
export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: customerCookieName(tenant.id),
    value: '',
    maxAge: 0,
    path: '/',
  });
  return res;
}
