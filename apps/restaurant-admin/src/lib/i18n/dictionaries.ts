/**
 * Admin-side translation dictionary.
 *
 * The dashboard is Romanian-only for now. Keys follow the same dot-path
 * convention as the storefront (apps/restaurant-web/src/lib/i18n/dictionaries.ts)
 * so they can be merged later if multi-locale admin is ever needed.
 */
export const adminDictionary = {
  orders: {
    filter_active: 'Active',
    filter_today: 'Azi',
    filter_cash: 'Cash neîncasat',
    filter_all: 'Toate',
  },
  content: {
    draft_status_pending: 'În așteptare',
    draft_status_approved: 'Aprobat',
    draft_status_rejected: 'Respins',
  },
} as const;

export type AdminDictKey = LeafPaths<typeof adminDictionary>;

// Utility: extract all dot-path leaf keys from a nested const object.
type LeafPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? P extends '' ? K : `${P}.${K}`
    : T[K] extends object
      ? LeafPaths<T[K], P extends '' ? K : `${P}.${K}`>
      : never;
}[keyof T & string];

/**
 * Look up a key in the admin dictionary with a human-friendly fallback.
 *
 * If `key` is not found, returns `defaultValue` when provided, otherwise
 * converts the last segment of the key to title-case (e.g.
 * `orders.filter_active` → `Filter Active`) so the UI never shows a raw
 * dot-path to the user.
 */
export function tAdmin(key: AdminDictKey, defaultValue?: string): string {
  const segments = key.split('.');
  let cursor: unknown = adminDictionary;
  for (const seg of segments) {
    if (cursor && typeof cursor === 'object' && seg in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[seg];
    } else {
      cursor = undefined;
      break;
    }
  }
  if (typeof cursor === 'string') return cursor;
  if (defaultValue !== undefined) return defaultValue;
  // Last resort: turn the final path segment into a readable label.
  const last = segments[segments.length - 1] ?? key;
  return last
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
