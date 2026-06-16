import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { verifyPin } from '@/lib/display-pin';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 12h session cookie
const COOKIE_MAX_AGE = 60 * 60 * 12;

// Brute-force guard: 5 PIN attempts per IP per minute.
const PIN_ATTEMPT_LIMIT = 5;
const PIN_WINDOW_MS = 60_000;

type Body = { tenantSlug: string; pin: string };

export async function POST(req: NextRequest) {
  // Throttle per IP BEFORE any JSON parse / DB / verifyPin work.
  const ip = clientIpFrom(req);
  const rl = checkRateLimit(`display-pin:${ip}`, PIN_ATTEMPT_LIMIT, PIN_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Prea multe încercări. Reîncearcă în scurt timp.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

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

  const supabase = createAdminClientUntyped();

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
    // path '/' (not '/display/<slug>') so the cookie is also sent to the
    // /api/display/* routes the tablet calls (e.g. self-pickup), which need
    // to confirm the device passed the PIN gate. The per-slug cookie NAME
    // keeps tenants isolated.
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({ ok: true });
}
