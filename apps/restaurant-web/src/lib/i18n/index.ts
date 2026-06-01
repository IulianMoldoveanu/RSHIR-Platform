import { dictionaries, type Dictionary } from './dictionaries';

export type Locale = 'ro' | 'en';

export const LOCALES: readonly Locale[] = ['ro', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'ro';
export const LOCALE_COOKIE = 'hir_locale';

// ── Locale extensibility helpers ──────────────────────────────────────────────
// ACTIVE_LOCALES have full dictionary coverage and are served to users today.
// RESERVED_LOCALES are declared for future expansion; no dictionary exists yet.
// Callers using `Locale` are unaffected — that type only covers active locales.

export const ACTIVE_LOCALES = ['ro', 'en'] as const;
export type ActiveLocale = typeof ACTIVE_LOCALES[number];

// Declared but not yet activated: no dictionaries, no routing, no hreflang.
export const RESERVED_LOCALES = ['bg', 'hu', 'pl', 'ru', 'uk'] as const;
export type ReservedLocale = typeof RESERVED_LOCALES[number];

export const ALL_DECLARED_LOCALES = [...ACTIVE_LOCALES, ...RESERVED_LOCALES] as const;

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

/**
 * Translate `key` for `locale`.
 *
 * Resolution order:
 *   1. `dictionaries[locale][key]`
 *   2. `dictionaries[DEFAULT_LOCALE][key]`
 *   3. `defaultValue` (when provided by the caller)
 *   4. Human-friendly label derived from the last key segment
 *      (e.g. `orders.filter_active` → `Filter Active`)
 *
 * The last-resort derivation means the UI never shows a raw dot-path string
 * to the user even when a dictionary key is accidentally missing.
 */
export function t(
  locale: Locale,
  key: TKey,
  vars?: Record<string, string | number>,
  defaultValue?: string,
): string {
  const found =
    lookup(dictionaries[locale], key) ?? lookup(dictionaries[DEFAULT_LOCALE], key);
  if (found !== undefined) return interpolate(found, vars);
  if (defaultValue !== undefined) return interpolate(defaultValue, vars);
  // Derive a readable label from the final path segment as a last resort.
  const lastSegment = key.split('.').pop() ?? key;
  const humanFallback = lastSegment
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return interpolate(humanFallback, vars);
}

