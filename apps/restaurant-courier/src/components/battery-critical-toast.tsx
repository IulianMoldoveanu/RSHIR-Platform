'use client';

import { useEffect } from 'react';
import { toast } from '@hir/ui';
import { useBatterySnapshot, BATTERY_CRITICAL_LEVEL } from './location-tracker';
import { isVoiceNavEnabled, speak } from '@/lib/voice-nav';

const FIRED_KEY = 'hir-courier-battery-critical-fired-at';
// Re-fire window: only emit a new toast once per hour even if the battery
// keeps dipping below the threshold. Prevents toast spam when the device
// is hovering at 14-15% for a long delivery.
const REFIRE_WINDOW_MS = 60 * 60 * 1000;

/**
 * One-shot toast nudge when the device battery drops below the critical
 * threshold during a shift. Mounted globally in the dashboard layout.
 *
 * The existing <BatterySaverBadge> is a passive banner; this is the active
 * "do something" nudge: "Bateria e sub 15%. Conectează încărcătorul."
 *
 * Renders null. Skips entirely when Battery API is unavailable or when the
 * device is charging.
 */
export function BatteryCriticalToast() {
  const battery = useBatterySnapshot();

  useEffect(() => {
    if (!battery) return;
    if (battery.charging) return;
    if (battery.level > BATTERY_CRITICAL_LEVEL) return;

    // De-dupe: don't fire more than once per hour.
    let lastFiredAt = 0;
    try {
      const raw = sessionStorage.getItem(FIRED_KEY);
      if (raw) lastFiredAt = Number(raw) || 0;
    } catch {
      // sessionStorage unavailable — proceed.
    }
    if (Date.now() - lastFiredAt < REFIRE_WINDOW_MS) return;

    try {
      sessionStorage.setItem(FIRED_KEY, String(Date.now()));
    } catch {
      // ignore
    }

    const percent = Math.round(battery.level * 100);
    const message = `Bateria e la ${percent}%. Conectează încărcătorul.`;
    toast(message, { duration: 8_000 });

    if (isVoiceNavEnabled()) speak(message);
  }, [battery]);

  return null;
}
