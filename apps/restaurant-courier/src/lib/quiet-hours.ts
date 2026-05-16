/**
 * Optional "do not disturb" window per courier — silences the offer chirp
 * (and any opt-in voice prompts) outside their preferred working hours.
 *
 * Defaults: disabled. When enabled, default 22:00–07:00 — sleep hours for
 * couriers who keep the dashboard open between shifts.
 *
 * Persisted to LocalStorage as a single JSON blob so the schema can grow
 * (e.g. add a per-day-of-week override) without a migration.
 */

export type QuietHours = {
  enabled: boolean;
  // 24h clock, "HH:MM"
  startHHmm: string;
  endHHmm: string;
};

export const STORAGE_KEY = 'hir-courier-quiet-hours';

export const DEFAULT_QUIET: QuietHours = {
  enabled: false,
  startHHmm: '22:00',
  endHHmm: '07:00',
};

export function readQuietHours(): QuietHours {
  if (typeof localStorage === 'undefined') return DEFAULT_QUIET;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUIET;
    const parsed = JSON.parse(raw) as Partial<QuietHours>;
    return {
      enabled: parsed.enabled === true,
      startHHmm:
        typeof parsed.startHHmm === 'string' && /^\d{2}:\d{2}$/.test(parsed.startHHmm)
          ? parsed.startHHmm
          : DEFAULT_QUIET.startHHmm,
      endHHmm:
        typeof parsed.endHHmm === 'string' && /^\d{2}:\d{2}$/.test(parsed.endHHmm)
          ? parsed.endHHmm
          : DEFAULT_QUIET.endHHmm,
    };
  } catch {
    return DEFAULT_QUIET;
  }
}

export function writeQuietHours(q: QuietHours): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch {
    // ignore
  }
}

/**
 * Convert HH:MM to minutes-since-midnight. Invalid inputs return null.
 */
function parseHHmm(s: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  const [hh, mm] = s.split(':').map(Number);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * True iff `now` (server-local) falls inside the courier's quiet window.
 * Handles overnight ranges where start > end (e.g. 22:00–07:00).
 *
 * Returns false when quiet-hours are disabled or when either bound is malformed.
 */
export function isInsideQuietHours(q: QuietHours, now: Date = new Date()): boolean {
  if (!q.enabled) return false;
  const start = parseHHmm(q.startHHmm);
  const end = parseHHmm(q.endHHmm);
  if (start === null || end === null) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false; // empty window
  if (start < end) {
    return minute >= start && minute < end;
  }
  // Overnight window: e.g. 22:00..07:00 → quiet from 22:00 to 23:59 OR from 00:00 to 06:59.
  return minute >= start || minute < end;
}

/**
 * Convenience: short-circuits playOfferChirp / speak callers without each
 * of them needing to read+parse the JSON themselves.
 */
export function isSilentNow(): boolean {
  return isInsideQuietHours(readQuietHours());
}
