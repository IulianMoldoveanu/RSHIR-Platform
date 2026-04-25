import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { fromAcceptLanguage, isLocale, LOCALE_COOKIE, type Locale } from './index';

/**
 * Resolves the active locale. Order: `hir_locale` cookie >
 * Accept-Language header > 'ro'. Pass a NextRequest from middleware /
 * route handlers; omit it inside server components (reads next/headers).
 */
export function getLocale(req?: NextRequest): Locale {
  if (req) {
    const fromCookie = req.cookies.get(LOCALE_COOKIE)?.value;
    if (isLocale(fromCookie)) return fromCookie;
    return fromAcceptLanguage(req.headers.get('accept-language'));
  }
  const fromCookie = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return fromAcceptLanguage(headers().get('accept-language'));
}
