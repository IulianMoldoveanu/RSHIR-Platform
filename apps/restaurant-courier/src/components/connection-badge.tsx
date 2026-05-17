'use client';

import { Wifi, WifiOff } from 'lucide-react';
import { useNetworkQuality, type NetworkQuality } from '@/lib/network-quality';

// Mapping from effective type to badge config. Colors follow the same
// red/amber/green traffic-light convention used elsewhere in the courier UI.
const CONFIG: Record<
  NetworkQuality,
  { bars: 1 | 2 | 3 | 4; label: string; tone: string; tooltip: string }
> = {
  offline: {
    bars: 1,
    label: 'Offline',
    tone: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
    tooltip: 'Conexiune pierdută — datele nu se sincronizează',
  },
  '2g': {
    bars: 1,
    label: '2G',
    tone: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
    tooltip: 'Conexiune slabă (2G) — actualizări lente',
  },
  '3g': {
    bars: 2,
    label: '3G',
    tone: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    tooltip: 'Conexiune medie (3G) — actualizare ~5 sec',
  },
  '4g': {
    bars: 4,
    label: '4G',
    tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
    tooltip: 'Conexiune bună (4G) — actualizare 2 sec',
  },
};

// Visual signal-bar stack: 4 vertical bars of increasing height.
// Filled bars match the tone colour; empty bars are zinc-600.
function SignalBars({ filled, tone }: { filled: number; tone: string }) {
  const barHeights = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4.5'];

  // Extract the active color class from the tone string so filled bars
  // use the same hue as the badge text.
  const activeColor = tone.includes('emerald')
    ? 'bg-emerald-400'
    : tone.includes('amber')
      ? 'bg-amber-400'
      : 'bg-rose-400';

  return (
    <span className="flex items-end gap-px" aria-hidden>
      {barHeights.map((h, i) => (
        <span
          key={i}
          className={`inline-block w-[3px] rounded-sm ${h} ${
            i < filled ? activeColor : 'bg-zinc-600'
          }`}
        />
      ))}
    </span>
  );
}

// Small header badge showing current connection type and signal bars.
// Uses a <button> wrapper (invisible) to expose the tooltip on long-press
// via the title attribute — satisfies touch accessibility without a full
// modal. Keyboard-accessible via focus.
export function ConnectionBadge() {
  const quality = useNetworkQuality();
  const cfg = CONFIG[quality];

  const isOffline = quality === 'offline';
  const Icon = isOffline ? WifiOff : Wifi;

  return (
    <div
      role="status"
      aria-label={`Conexiune: ${cfg.label} — ${cfg.tooltip}`}
      title={cfg.tooltip}
      tabIndex={0}
      className={`flex min-h-[44px] min-w-[44px] cursor-default items-center justify-center rounded-full border px-2 py-1 text-[11px] font-semibold tabular-nums outline-none ring-1 ring-inset transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 ${cfg.tone} ${
        isOffline ? 'ring-rose-500/20' : cfg.bars >= 3 ? 'ring-emerald-500/20' : 'ring-amber-500/20'
      }`}
    >
      <span className="flex items-center gap-1">
        {isOffline ? (
          <Icon className="h-3 w-3" aria-hidden strokeWidth={2.25} />
        ) : (
          <SignalBars filled={cfg.bars} tone={cfg.tone} />
        )}
        <span>{cfg.label}</span>
      </span>
    </div>
  );
}
