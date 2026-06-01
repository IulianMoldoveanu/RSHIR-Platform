import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPin } from '@/lib/display-pin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 12h session cookie
const COOKIE_MAX_AGE = 60 * 60 * 12;

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
  const supabase = createAdminClient() as any;

  // Resolve tenantSlug → tenant_id
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .maybeSingle();

  if (tenantErr || !tenant) {
    return NextResponse.json({ error: 'PIN incorect' }, { status: 401 });
  }

  // Look up the PIN record for this tenant
  const { data: pinRow, error: pinErr } = await supabase
    .from('tenant_display_pins')
    .select('pin_hash')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (pinErr || !pinRow) {
    // No PIN configured for this tenant
    return NextResponse.json({ error: 'Display PIN not configured for this tenant' }, { status: 404 });
  }

  const ok = await verifyPin(pin, pinRow.pin_hash as string);
  if (!ok) {
    return NextResponse.json({ error: 'PIN incorect' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(`display-auth-${tenantSlug}`, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: `/display/${tenantSlug}`,
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({ ok: true });
}
