import { dictionaries, type Dictionary } from './dictionaries';

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

// ─────────────────────────────────────────────────────────────────
// Dot-path keying with autocomplete on string leaves only.
// ─────────────────────────────────────────────────────────────────

type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? Join<P, K>
    : T[K] extends object
      ? Leaves<T[K], Join<P, K>>
      : never;
}[keyof T & string];

export type TKey = Leaves<Dictionary>;

function lookup(dict: unknown, path: string): string | undefined {
  let cursor: unknown = dict;
  for (const segment of path.split('.')) {
    if (cursor && typeof cursor === 'object' && segment in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

export function t(
  locale: Locale,
  key: TKey,
  vars?: Record<string, string | number>,
): string {
  const found =
    lookup(dictionaries[locale], key) ?? lookup(dictionaries[DEFAULT_LOCALE], key);
  return interpolate(found ?? key, vars);
}

