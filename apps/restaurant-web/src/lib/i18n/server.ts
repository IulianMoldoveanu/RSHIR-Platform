import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import {
  DEFAULT_LOCALE,
  fromAcceptLanguage,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
} from './index';

/**
 * Resolves the active locale. Order: `hir_locale` cookie >
 * Accept-Language header > 'ro'. Pass a NextRequest from middleware /
 * route handlers; omit it inside server components (reads next/headers).
 */
export async function getLocale(req?: NextRequest): Promise<Locale> {
  if (req) {
    const fromCookie = req.cookies.get(LOCALE_COOKIE)?.value;
    if (isLocale(fromCookie)) return fromCookie;
    return fromAcceptLanguage(req.headers.get('accept-language'));
  }
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const hdrs = await headers();
  return fromAcceptLanguage(hdrs.get('accept-language'));
}

/**
 * The locale the visitor *chose*, or the default — Accept-Language is ignored.
 *
 * For pages whose indexed language has to stay fixed. The SEO audit of
 * 2026-05-10 pinned the marketing landing to RO so that Google, and visitors
 * arriving with an English browser, would see one canonical Romanian page.
 * That was implemented by hardcoding `currentLocale="ro"`, which also threw
 * away the cookie — so the flag in the header flipped the cookie, the page
 * re-rendered, and nothing changed. The switcher looked broken because on the
 * homepage it was.
 *
 * Reading only the cookie keeps the SEO decision exactly: a crawler sends no
 * cookie and still gets RO. Someone who clicks the flag is a person stating a
 * preference, and we honour it.
 */
export async function getChosenLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  return isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
}
