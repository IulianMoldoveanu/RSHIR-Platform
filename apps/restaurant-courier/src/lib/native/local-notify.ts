'use client';

/**
 * Local notifications bridge.
 *
 * Native (Capacitor): schedules notifications via @capacitor/local-notifications.
 * Browser / PWA: uses the Notifications API (best-effort, not all browsers support
 * scheduled notifications; we fire them immediately after the delay using setTimeout).
 *
 * Use cases:
 *   - Shift start reminder (scheduled N minutes before planned shift)
 *   - Inactivity reminder (fired after courier has been idle > 10 min during shift)
 */

import { Capacitor } from '@capacitor/core';

export type ScheduleResult = 'scheduled' | 'denied' | 'unsupported';

let _nextId = 1_000; // start above any IDs the app might use elsewhere
function nextId(): number { return _nextId++; }

/**
 * Schedule a local notification to appear at a specific Date.
 *
 * Returns the notification ID (can be used to cancel it).
 * Returns null if scheduling failed.
 */
export async function scheduleNotification(opts: {
  title: string;
  body: string;
  at: Date;
  id?: number;
}): Promise<number | null> {
  const id = opts.id ?? nextId();

  // ── Native path ──────────────────────────────────────────────────────────
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return null;

      await LocalNotifications.schedule({
        notifications: [{ id, title: opts.title, body: opts.body, schedule: { at: opts.at } }],
      });
      return id;
    } catch {
      return null;
    }
  }

  // ── Browser path ─────────────────────────────────────────────────────────
  if (typeof Notification === 'undefined') return null;
  if (Notification.permission === 'denied') return null;

  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return null;
  }

  const delayMs = Math.max(0, opts.at.getTime() - Date.now());
  setTimeout(() => {
    new Notification(opts.title, { body: opts.body });
  }, delayMs);

  return id;
}

/**
 * Cancel a previously scheduled notification by ID.
 */
export async function cancelNotification(id: number): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch { /* ignore */ }
  }
  // Browser: no cancellation possible for setTimeout-based notifications.
  // Callers should track IDs and avoid scheduling duplicates.
}

/**
 * Convenience: schedule a shift start reminder N minutes before shiftStart.
 * Returns the notification ID or null on failure.
 */
export async function scheduleShiftReminder(
  shiftStart: Date,
  minutesBefore = 15,
): Promise<number | null> {
  const at = new Date(shiftStart.getTime() - minutesBefore * 60_000);
  if (at <= new Date()) return null; // already past
  return scheduleNotification({
    title: 'Tura ta începe în curând',
    body: `Tura ta la HIR Curier începe în ${minutesBefore} minute.`,
    at,
  });
}

/**
 * Convenience: fire an inactivity reminder immediately (shift active but
 * no recent orders accepted). Called from the inactivity check cron in
 * the shift page.
 */
export async function fireInactivityReminder(): Promise<void> {
  await scheduleNotification({
    title: 'Ești disponibil?',
    body: 'Nu ai acceptat comenzi în ultimele 10 minute. Apasă pentru a reveni la hartă.',
    at: new Date(),
  });
}
