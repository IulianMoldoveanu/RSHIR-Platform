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

/**
 * Format a travelled distance held in metres. Below a kilometre couriers
 * think in metres ("640 m"); above it, one decimal is all the precision a
 * sampled GPS trail honestly carries ("4,2 km").
 *
 * null renders as an em dash on purpose: "we did not measure this" and
 * "the courier travelled zero metres" are different claims, and only one
 * of them is ever true.
 */
export function formatDistanceM(
  meters: number | null | undefined,
  locale = 'ro-RO',
): string {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(meters / 1000);
  return `${km} km`;
}

/**
 * Format an elapsed duration in milliseconds as "42 min" / "1 h 12 min".
 * Anything under a minute rounds up rather than showing "0 min", which
 * reads as broken data instead of a fast delivery.
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/**
 * Milliseconds between two ISO timestamps. Returns null when either end is
 * missing or the pair is inverted — callers render that as "—" rather than
 * a negative duration.
 */
export function elapsedMs(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return to - from;
}
