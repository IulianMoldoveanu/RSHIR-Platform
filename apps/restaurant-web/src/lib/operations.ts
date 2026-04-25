/**
 * Operational settings stored under tenants.settings (JSONB):
 *
 *   is_accepting_orders: boolean (default true)
 *   pause_reason: string | null  (e.g. "Inchis exceptional astazi")
 *   pickup_eta_minutes: number   (default 30)
 *   opening_hours: {
 *     mon: [{ open: "10:00", close: "22:00" }, ...],
 *     tue: [...], wed: [...], thu: [...], fri: [...], sat: [...], sun: [...]
 *   }
 *
 * Each weekday is an array of windows so e.g. Tue 10-14 + 17-22 is expressible.
 * All times are interpreted in Europe/Bucharest. Missing keys are treated as
 * "always open" so the storefront does not block existing tenants until the
 * owner configures a schedule.
 */

import type { Locale } from './i18n';

const TZ = 'Europe/Bucharest';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAYS)[number];

export type OpeningWindow = { open: string; close: string };
export type OpeningHours = Partial<Record<DayKey, OpeningWindow[]>>;

export type OperationalSettings = {
  is_accepting_orders?: boolean;
  pause_reason?: string | null;
  pickup_eta_minutes?: number;
  opening_hours?: OpeningHours;
};

export type OpenStatus = {
  open: boolean;
  reason?: string;
  nextOpen?: Date;
};

export function isAcceptingOrders(settings: unknown): boolean {
  const s = (settings ?? {}) as OperationalSettings;
  return s.is_accepting_orders !== false;
}

export function getPickupEtaMinutes(settings: unknown): number {
  const s = (settings ?? {}) as OperationalSettings;
  const n = s.pickup_eta_minutes;
  return typeof n === 'number' && n > 0 ? n : 30;
}

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (h < 0 || h > 24 || mn < 0 || mn >= 60) return null;
  return h * 60 + mn;
}

type LocalParts = { y: number; m: number; d: number; weekday: number; minutes: number };

function localPartsInTz(date: Date): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Returns a UTC Date corresponding to the given Y/M/D h:m in Europe/Bucharest. */
function dateFromLocalParts(y: number, m: number, d: number, hm: number): Date {
  const h = Math.floor(hm / 60);
  const mn = hm % 60;
  const guess = Date.UTC(y, m - 1, d, h, mn);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const guessAsTzUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = guessAsTzUtc - guess;
  return new Date(guess - offsetMs);
}

function addDaysUtc(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + delta);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * Computes whether the tenant is currently open in Europe/Bucharest. Missing
 * `opening_hours` is treated as always-open. When closed, returns the next
 * window's start time within the upcoming 7 days (if any).
 */
export function isOpenNow(settings: unknown, now: Date = new Date()): OpenStatus {
  const s = (settings ?? {}) as OperationalSettings;
  const hours = s.opening_hours;
  if (!hours || typeof hours !== 'object') return { open: true };

  const today = localPartsInTz(now);

  for (let offset = 0; offset < 7; offset++) {
    const dayIdx = (today.weekday + offset) % 7;
    const dayKey = DAYS[dayIdx];
    const windows = hours[dayKey];
    if (!Array.isArray(windows) || windows.length === 0) continue;

    const sorted = windows
      .map((w) => ({ open: parseHm(w.open), close: parseHm(w.close) }))
      .filter((w): w is { open: number; close: number } => w.open !== null && w.close !== null && w.close > w.open)
      .sort((a, b) => a.open - b.open);

    for (const w of sorted) {
      if (offset === 0 && today.minutes >= w.open && today.minutes < w.close) {
        return { open: true };
      }
      if (offset > 0 || today.minutes < w.open) {
        const target = offset === 0
          ? { y: today.y, m: today.m, d: today.d }
          : addDaysUtc(today.y, today.m, today.d, offset);
        return {
          open: false,
          nextOpen: dateFromLocalParts(target.y, target.m, target.d, w.open),
        };
      }
    }
  }

  return { open: false };
}

/** Formats a "next open" Date as a locale-aware short label, e.g. "luni 10:00" / "Monday 10:00". */
export function formatNextOpen(date: Date, locale: Locale = 'ro'): string {
  const tag = locale === 'en' ? 'en-GB' : 'ro-RO';
  return new Intl.DateTimeFormat(tag, {
    timeZone: TZ,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
