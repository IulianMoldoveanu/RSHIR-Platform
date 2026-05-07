// Pure helpers for the QW1-QW10 UI/UX quick-wins (audit 2026-05-08).
//
// Extracted into a stand-alone module so they're trivially unit-testable
// without pulling in Next.js / React / Supabase. The actual rendering lives
// inside the relevant pages; this file is the logic-bearing piece.

export type RangePreset = 7 | 30 | 90;

/**
 * QW4 — ticket-aging color drift bucket.
 *
 * Returns a Tailwind border-l-* utility class to apply to the order row's
 * left bar. Calibrated to the audit spec:
 *   < 5min   emerald-300
 *   < 15min  amber-400
 *   < 25min  orange-500
 *   ≥ 25min  rose-500 + animate-pulse
 *
 * Closed orders (DELIVERED / CANCELLED) skip the cue — aging is a
 * floor-manager attention signal that's irrelevant once the ticket is
 * closed.
 */
export function ticketAgingClass(
  status: string,
  createdAtMs: number,
  nowMs: number,
): string {
  if (status === 'DELIVERED' || status === 'CANCELLED') return 'border-l-transparent';
  const age = nowMs - createdAtMs;
  if (age < 5 * 60_000) return 'border-l-emerald-300';
  if (age < 15 * 60_000) return 'border-l-amber-400';
  if (age < 25 * 60_000) return 'border-l-orange-500';
  return 'border-l-rose-500 animate-pulse';
}

/**
 * QW2 — pad a daily series into a fixed 7-element array ending today.
 *
 * Source rows come from `v_orders_daily` with `day` as ISO date (YYYY-MM-DD)
 * and a numeric metric. Missing days = 0. Output length is exactly 7.
 *
 * Pure function — accepts `nowMs` so tests can pin the clock.
 */
export function buildSparklineSeries(
  rows: Array<{ day: string; value: number }>,
  nowMs: number,
): number[] {
  const byKey = new Map<string, number>();
  for (const r of rows) {
    byKey.set(r.day.slice(0, 10), r.value);
  }
  const today = new Date(nowMs);
  today.setUTCHours(0, 0, 0, 0);
  const out: number[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(byKey.get(key) ?? 0);
  }
  return out;
}

/**
 * QW10 — narrow a daily-row array to the active range preset.
 *
 * Server returns up to 90 days; client filters by 7 / 30 / 90 days. Cutoff
 * is inclusive — `days = 7` returns rows from 7 days ago through today,
 * inclusive (i.e. 7 calendar days end-to-end).
 */
export function filterDailyByRange<T extends { day: string }>(
  daily: T[],
  days: RangePreset,
  nowMs: number,
): T[] {
  if (daily.length === 0) return daily;
  const cutoff = new Date(nowMs);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  return daily.filter((d) => new Date(d.day) >= cutoff);
}
