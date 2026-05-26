/**
 * Shared formatting helpers — pure functions, no runtime deps.
 *
 * Locale model: accepts a BCP47 string (defaulting to 'ro-RO'). Apps that
 * use the typed Locale union from their own i18n module pass the resolved
 * BCP47 tag (e.g. locale === 'en' ? 'en-GB' : 'ro-RO'). This package stays
 * decoupled from any app-specific locale enum.
 *
 * Extracted from the duplicate copies that lived in:
 *   - apps/restaurant-web/src/lib/format.ts (Intl-based, locale-aware)
 *   - apps/restaurant-admin/.../[id]/page.tsx (toFixed, en-only)
 *   - apps/restaurant-courier/.../[id]/page.tsx (inline toFixed)
 * One source of truth from this PR forward.
 */

/**
 * Format a RON amount via Intl.NumberFormat (proper localised decimal +
 * currency placement). Default locale is 'ro-RO' which renders "12,50 RON".
 * Pass 'en-GB' for "12.50 RON".
 */
export function formatRon(amount: number | string | null | undefined, locale = 'ro-RO'): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'RON',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

/**
 * Format a timestamp as a short local time (HH:mm). Locale-aware so EN
 * customers see "14:35" via 'en-GB' formatting and RO customers see the
 * same with 'ro-RO'. Falls back to 'ro-RO' when locale is omitted.
 */
export function formatLocalTime(iso: string, locale = 'ro-RO'): string {
  try {
    return new Date(iso).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Format a timestamp as a relative "X min" / "Xs" / "Xh" label. Used in
 * dashboards where "ultima poziție acum 3 min" feels more alive than an
 * absolute timestamp. Past-time only — future dates clamp to "0s".
 */
export function formatRelativeAge(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)}h`;
}
