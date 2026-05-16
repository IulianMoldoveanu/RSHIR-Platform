// Minimal locale plumbing for restaurant-admin.
//
// Help center is currently the only surface in admin that ships in two
// languages. We mirror the cookie name (`hir_locale`) and Accept-Language
// fallback used by restaurant-web so a user who flipped locale on the
// public site sees the same language in admin.

export type Locale = 'ro' | 'en';

export const LOCALES: readonly Locale[] = ['ro', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'ro';
export const LOCALE_COOKIE = 'hir_locale';

export function isLocale(v: unknown): v is Locale {
  return v === 'ro' || v === 'en';
}

export function fromAcceptLanguage(al: string | null): Locale {
  if (!al) return DEFAULT_LOCALE;
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
  return DEFAULT_LOCALE;
}
