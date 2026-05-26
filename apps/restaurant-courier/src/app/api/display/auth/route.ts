import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 12h session cookie
const COOKIE_MAX_AGE = 60 * 60 * 12;
// Cookie name used by /api/display/orders/[id]/self-pickup to authorise
// kiosk-side claim requests. Value = tenant_id (UUID) so the claim handler
// can verify the order belongs to the same tenant the PIN unlocked.
export const DISPLAY_TENANT_COOKIE = 'hir-display-tenant';

type Body = { tenantSlug: string; pin: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tenantSlug, pin } = body;
  if (!tenantSlug || !pin) {
    return NextResponse.json({ error: 'tenantSlug and pin required' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Resolve tenant_id and verify PIN via verify_display_pin RPC (PR #717).
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .maybeSingle();

  if (!tenantRow?.id) {
    return NextResponse.json({ error: 'Tenant inexistent' }, { status: 404 });
  }

  const { data: pinOk, error: rpcErr } = await admin.rpc('verify_display_pin', {
    p_tenant_slug: tenantSlug,
    p_pin: pin,
  });

  if (rpcErr || pinOk !== true) {
    return NextResponse.json({ error: 'PIN incorect' }, { status: 401 });
  }

  const cookieStore = await cookies();
  // Path '/' so the cookie is sent on /api/display/** routes too (kiosk
  // self-pickup endpoint reads it to authorise the claim). httpOnly + secure
  // in prod prevent JS access and over-the-wire interception.
  cookieStore.set(DISPLAY_TENANT_COOKIE, tenantRow.id as string, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({ ok: true });
}
