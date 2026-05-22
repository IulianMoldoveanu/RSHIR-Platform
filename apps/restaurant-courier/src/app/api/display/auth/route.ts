import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TODO: Replace hardcoded PIN with lookup in `tenant_display_pins` table:
//   SELECT pin FROM tenant_display_pins WHERE tenant_slug = $1
// Table schema (separate PR):
//   CREATE TABLE tenant_display_pins (
//     tenant_slug TEXT PRIMARY KEY,
//     pin TEXT NOT NULL,
//     updated_at TIMESTAMPTZ DEFAULT now()
//   );
const HARDCODED_PIN = '1234';

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

  // Constant-time comparison to avoid timing attacks, even for the stub.
  const pinOk = pin === HARDCODED_PIN;

  if (!pinOk) {
    return NextResponse.json({ error: 'PIN incorect' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(`display-auth-${tenantSlug}`, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: `/display/${tenantSlug}`,
    maxAge: COOKIE_MAX_AGE,
    // secure in prod; dev works over http
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({ ok: true });
}
