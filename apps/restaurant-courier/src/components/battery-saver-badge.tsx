'use client';

import { BatteryLow, BatteryWarning } from 'lucide-react';
import {
  useBatterySnapshot,
  BATTERY_LOW_LEVEL,
  BATTERY_CRITICAL_LEVEL,
} from './location-tracker';

// Visible affordance for the silent battery-aware GPS throttle in
// <LocationTracker>. Without this badge, a courier on 12% battery sees
// GPS fixes slow from 30s → 2min and might assume the app or dispatcher
// is broken. The pill makes the trade-off explicit ("we're protecting
// your battery") and tells the rider exactly what the new fix cadence is.
//
// Rendered inline under the header, between the sticky header and the
// OfflineBanner slot. Renders nothing when:
//   - Battery API unsupported (snapshot === null)
//   - Device is charging (no throttle in effect)
//   - Battery level above the low threshold
//
// Copy intentionally avoids the word "saver" because Romanian translation
// "economisitor" is awkward — "Mod economisire baterie" reads cleaner
// and matches Android's RO localization.
export function BatterySaverBadge() {
  const battery = useBatterySnapshot();
  if (!battery || battery.charging) return null;
  if (battery.level > BATTERY_LOW_LEVEL) return null;

  const critical = battery.level <= BATTERY_CRITICAL_LEVEL;
  const Icon = critical ? BatteryWarning : BatteryLow;
  const cadenceLabel = critical ? '2 min' : '1 min';
  const tone = critical
    ? 'border-rose-500/40 bg-rose-500/15 text-rose-100 shadow-sm shadow-rose-500/20'
    : 'border-amber-500/40 bg-amber-500/15 text-amber-100 shadow-sm shadow-amber-500/20';
  const discTone = critical
    ? 'bg-rose-500/20 ring-rose-500/40'
    : 'bg-amber-500/20 ring-amber-500/40';
  const iconTone = critical ? 'text-rose-200' : 'text-amber-200';
  const percent = Math.round(battery.level * 100);

  return (
    <div
      role="status"
      aria-live="polite"
      // Same stacking pattern as <OfflineBanner /> so the two can coexist
      // when the courier is both offline AND low on battery.
      className={`sticky top-14 z-[1199] flex items-center justify-center gap-2 border-b px-3 py-2 text-[11px] font-semibold backdrop-blur ${tone}`}
    >
      <span
        aria-hidden
        className={`flex h-6 w-6 items-center justify-center rounded-full ring-1 ${discTone}`}
      >
        <Icon className={`h-3.5 w-3.5 ${iconTone}`} strokeWidth={2.25} />
      </span>
      <span>
        Mod economisire baterie ({percent}%) — GPS la {cadenceLabel}
      </span>
    </div>
  );
}
