'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useGpsTimestamp } from '@/lib/gps-timestamp-context';

// Thresholds in milliseconds.
const STALE_MS = 60_000;    // 1 minute
const LOST_MS = 5 * 60_000; // 5 minutes

type GpsState = 'live-now' | 'live-aged' | 'stale' | 'lost' | 'waiting';

function classify(lastFixAt: number | null, now: number): GpsState {
  if (lastFixAt === null) return 'waiting';
  const age = now - lastFixAt;
  if (age < 30_000) return 'live-now';
  if (age < STALE_MS) return 'live-aged';
  if (age < LOST_MS) return 'stale';
  return 'lost';
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}min`;
}

// Small header pill showing how fresh the last GPS fix is. Renders null when
// the courier has not yet received a GPS fix in the current session (e.g.
// shift not started, or GPS permission not granted). Once any fix arrives
// via <LocationTracker>, this pill ticks in real-time via a 1-second
// setInterval and changes colour as the fix ages.
//
// Only shown when the tracker has actually emitted at least one fix.
export function GpsStalnessPill() {
  const { lastFixAt } = useGpsTimestamp();
  const [now, setNow] = useState(() => Date.now());

  // 1-second ticker to keep the displayed age live without re-mounting.
  useEffect(() => {
    if (lastFixAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [lastFixAt]);

  const state = classify(lastFixAt, now);
  if (state === 'waiting') return null;

  const age = lastFixAt !== null ? now - lastFixAt : 0;

  const config: Record<GpsState, { label: string; tone: string; tooltip: string }> = {
    'live-now': {
      label: 'Live · acum',
      tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
      tooltip: 'GPS actualizat — fix primit acum',
    },
    'live-aged': {
      label: `Live · ${formatAge(age)}`,
      tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
      tooltip: `GPS primit în urmă cu ${formatAge(age)}`,
    },
    stale: {
      label: `Întârziat · ${formatAge(age)}`,
      tone: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
      tooltip: `GPS întârziat — ultimul fix în urmă cu ${formatAge(age)}`,
    },
    lost: {
      label: `Pierdut · ${formatAge(age)}`,
      tone: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
      tooltip: `GPS pierdut — niciun fix în ultimele ${formatAge(age)}`,
    },
    // Unreachable branch once state !== 'waiting', but TypeScript needs it.
    waiting: {
      label: '',
      tone: '',
      tooltip: '',
    },
  };

  const { label, tone, tooltip } = config[state];

  return (
    <div
      role="status"
      aria-label={tooltip}
      title={tooltip}
      tabIndex={0}
      className={`flex min-h-[44px] cursor-default items-center justify-center rounded-full border px-2 py-1 text-[11px] font-semibold tabular-nums outline-none ring-1 ring-inset transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 ${tone} ${
        state === 'live-now' || state === 'live-aged'
          ? 'ring-emerald-500/20'
          : state === 'stale'
            ? 'ring-amber-500/20'
            : 'ring-rose-500/20'
      }`}
    >
      <span className="flex items-center gap-1">
        {state === 'live-now' ? (
          // Pulsing emerald dot reads as "GPS alive right now" — matches the
          // affordance pattern of the live ETA pill on order detail.
          <span
            aria-hidden
            className="relative flex h-2 w-2"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
          </span>
        ) : (
          <MapPin className="h-3 w-3" aria-hidden strokeWidth={2.25} />
        )}
        <span>{label}</span>
      </span>
    </div>
  );
}
