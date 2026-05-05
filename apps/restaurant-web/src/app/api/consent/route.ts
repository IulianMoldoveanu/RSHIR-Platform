import { NextResponse, type NextRequest } from 'next/server';
import {
  ALL_RECORD,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  ESSENTIAL_RECORD,
  isLegacyConsent,
  serializeConsent,
  type ConsentRecord,
} from '@/lib/consent';
import { assertSameOrigin } from '@/lib/origin-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IncomingBody =
  | { value: 'all' | 'essential' }
  | {
      analytics?: boolean;
      marketing?: boolean;
    };

function recordFromBody(body: IncomingBody | null): ConsentRecord | null {
  if (!body) return null;
  if ('value' in body && body.value !== undefined) {
    if (!isLegacyConsent(body.value)) return null;
    const base = body.value === 'all' ? ALL_RECORD : ESSENTIAL_RECORD;
    return { ...base, ts: Date.now() };
  }
  if ('analytics' in body || 'marketing' in body) {
    return {
      v: 1,
      essential: true,
      analytics: body.analytics === true,
      marketing: body.marketing === true,
      ts: Date.now(),
    };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  let body: IncomingBody | null;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const record = recordFromBody(body);
  if (!record) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
  }

  const res = NextResponse.json({ value: record });
  res.cookies.set({
    name: CONSENT_COOKIE,
    value: serializeConsent(record),
    maxAge: CONSENT_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  return res;
}
