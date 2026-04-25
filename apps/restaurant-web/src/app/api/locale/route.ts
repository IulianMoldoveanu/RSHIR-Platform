import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/lib/i18n';
import { assertSameOrigin } from '@/lib/origin-check';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export async function POST(req: NextRequest) {
  // RSHIR-26 H-1: reject cross-origin POSTs so a malicious page cannot
  // flip a victim's locale cookie via a hidden form.
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const locale = (body as { locale?: unknown } | null)?.locale;
  if (!isLocale(locale)) {
    return NextResponse.json({ error: 'invalid_locale' }, { status: 400 });
  }
  const res = NextResponse.json({ locale });
  res.cookies.set({
    name: LOCALE_COOKIE,
    value: locale,
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  return res;
}
