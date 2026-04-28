import { formatRon } from './format';
import type { Locale } from './i18n';

/**
 * Render the small "350g · 12.86 RON / 100g" line shown under an item's
 * price (RSHIR — Track A #9 per-gram visibility, Wolt/Bolt Food convention).
 *
 * Priority: free-text label > grams-derived. Returns null when nothing is
 * worth showing. Per-100g division-by-zero is guarded by the column check
 * (`grams > 0`) — we still defend here in case of stale/cached data.
 */
export function servingInfoLine(
  item: {
    price_ron: number;
    serving_size_grams: number | null;
    serving_size_label: string | null;
  },
  locale: Locale,
): string | null {
  if (item.serving_size_label && item.serving_size_label.trim() !== '') {
    return item.serving_size_label;
  }
  const g = item.serving_size_grams;
  if (g === null || g <= 0) return null;
  const per100g = (item.price_ron / g) * 100;
  return `${g}g · ${formatRon(per100g, locale)} / 100g`;
}
