// Lightweight locale resolution for the admin help center.
//
// Mirrors the pattern used in `apps/restaurant-web/src/lib/i18n/server.ts`
// but kept local to restaurant-admin to avoid pulling the marketing site's
// full dictionary system into the admin bundle. Only the help center reads
// this today.
//
// Resolution order: `hir_locale` cookie > Accept-Language header > 'ro'.

import { cookies, headers, type UnsafeUnwrappedCookies, type UnsafeUnwrappedHeaders } from 'next/headers';

export type HelpLocale = 'ro' | 'en';

export const HELP_LOCALES: readonly HelpLocale[] = ['ro', 'en'] as const;
export const HELP_DEFAULT_LOCALE: HelpLocale = 'ro';
export const HELP_LOCALE_COOKIE = 'hir_locale';

export function isHelpLocale(v: unknown): v is HelpLocale {
  return v === 'ro' || v === 'en';
}

export function helpLocaleFromAcceptLanguage(al: string | null): HelpLocale {
  if (!al) return HELP_DEFAULT_LOCALE;
  const parsed = al
    .split(',')
    .map((part) => {
      const [lang, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { lang: lang.toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { lang } of parsed) {
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('ro')) return 'ro';
  }
  return HELP_DEFAULT_LOCALE;
}

/**
 * Server-component-only. Reads cookie + accept-language via next/headers.
 */
export function getHelpLocale(): HelpLocale {
  const fromCookie = (cookies() as unknown as UnsafeUnwrappedCookies).get(HELP_LOCALE_COOKIE)?.value;
  if (isHelpLocale(fromCookie)) return fromCookie;
  return helpLocaleFromAcceptLanguage(
    (headers() as unknown as UnsafeUnwrappedHeaders).get('accept-language'),
  );
}
