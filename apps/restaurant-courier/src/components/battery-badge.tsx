'use client';

import { Battery, BatteryLow, BatteryWarning, BatteryCharging } from 'lucide-react';
import { useBatterySnapshot, BATTERY_LOW_LEVEL, BATTERY_CRITICAL_LEVEL } from './location-tracker';

// Battery indicator badge. Hidden when battery is above the low threshold
// (> 30%) — couriers don't need the clutter. Visible when:
//   - level <= 30% and NOT charging  → amber warning
//   - level <= 15% and NOT charging  → red critical
//   - charging + level <= 30%        → show charging icon (green) so the
//     courier knows the low-battery throttle has been lifted
//
// Kept separate from <BatterySaverBadge /> which is the full-width banner.
// This is the compact header chip showing exact percentage.
export function BatteryBadge() {
  const battery = useBatterySnapshot();

  // API not available or full battery — hide.
  if (!battery) return null;
  if (!battery.charging && battery.level > BATTERY_LOW_LEVEL) return null;
  // Charging AND above low threshold — no need to show anything.
  if (battery.charging && battery.level > BATTERY_LOW_LEVEL) return null;

  const percent = Math.round(battery.level * 100);
  const isCritical = !battery.charging && battery.level <= BATTERY_CRITICAL_LEVEL;
  const isCharging = battery.charging;

  const Icon = isCharging
    ? BatteryCharging
    : isCritical
      ? BatteryWarning
      : battery.level <= 0.1
        ? Battery
        : BatteryLow;

  const tone = isCharging
    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
    : isCritical
      ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
      : 'border-amber-500/40 bg-amber-500/15 text-amber-200';

  const label = isCharging ? `Încărcare ${percent}%` : `Baterie ${percent}%`;
  const tooltip = isCharging
    ? `Dispozitiv în încărcare — GPS la viteză normală`
    : isCritical
      ? `Baterie critică (${percent}%) — GPS redus la 2 minute`
      : `Baterie scăzută (${percent}%) — GPS redus la 1 minut`;

  return (
    <div
      role="status"
      aria-label={tooltip}
      title={tooltip}
      tabIndex={0}
      className={`flex min-h-[44px] min-w-[44px] cursor-default items-center justify-center rounded-full border px-2 py-1 text-[11px] font-semibold tabular-nums outline-none ring-1 ring-inset transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 ${tone} ${
        isCharging ? 'ring-emerald-500/20' : isCritical ? 'ring-rose-500/20' : 'ring-amber-500/20'
      }`}
    >
      <span className="flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
        <span>{percent}%</span>
      </span>
    </div>
  );
}
