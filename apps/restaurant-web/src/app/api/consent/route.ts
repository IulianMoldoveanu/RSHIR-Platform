import { NextResponse, type NextRequest } from 'next/server';
import { CONSENT_COOKIE, CONSENT_MAX_AGE_SECONDS, isConsent } from '@/lib/consent';
import { assertSameOrigin } from '@/lib/origin-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const value = (body as { value?: unknown } | null)?.value;
  if (!isConsent(value)) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
  }

  const res = NextResponse.json({ value });
  res.cookies.set({
    name: CONSENT_COOKIE,
    value,
    maxAge: CONSENT_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  return res;
}
