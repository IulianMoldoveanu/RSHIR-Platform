import { cookies, headers, type UnsafeUnwrappedCookies, type UnsafeUnwrappedHeaders } from 'next/headers';
import { fromAcceptLanguage, isLocale, LOCALE_COOKIE, type Locale } from './index';

/**
 * Resolves the active locale inside a server component. Order:
 * `hir_locale` cookie > Accept-Language header > 'ro'.
 *
 * Mirrors restaurant-web's helper so a logged-in user who flipped locale
 * on the storefront sees the same language in admin.
 */
export function getLocale(): Locale {
  const fromCookie = (cookies() as unknown as UnsafeUnwrappedCookies).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return fromAcceptLanguage((headers() as unknown as UnsafeUnwrappedHeaders).get('accept-language'));
}
