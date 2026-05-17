'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: 'De la acceptare',
  PICKED_UP: 'De la ridicare',
  IN_TRANSIT: 'De la plecare',
};

// Per-stage "starts to feel slow" thresholds in seconds. Tuned for the
// typical pilot pizza/burger run in Brașov (15-25 min total). Crossing
// the warn threshold drifts the chip amber; crossing crit drifts rose.
// The values are operational hints, not hard SLAs — the timer never
// blocks anything.
const THRESHOLDS: Record<string, { warn: number; crit: number }> = {
  ACCEPTED: { warn: 600, crit: 900 },     // 10 / 15 min waiting at pickup
  PICKED_UP: { warn: 300, crit: 600 },    // 5 / 10 min between pickup and movement
  IN_TRANSIT: { warn: 900, crit: 1500 },  // 15 / 25 min in transit
};

function formatElapsed(sinceMs: number): string {
  const totalSec = Math.floor(sinceMs / 1000);
  const totalMin = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (totalMin < 60) {
    return `${totalMin}:${secs.toString().padStart(2, '0')}`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
}

function toneFor(status: string, elapsedSec: number): {
  ring: string;
  text: string;
  label: string;
} {
  const t = THRESHOLDS[status];
  if (!t) return { ring: 'border-hir-border bg-hir-surface', text: 'text-hir-fg', label: 'text-hir-muted-fg' };
  if (elapsedSec >= t.crit) {
    return {
      ring: 'border-rose-500/40 bg-rose-500/10',
      text: 'text-rose-200',
      label: 'text-rose-300/80',
    };
  }
  if (elapsedSec >= t.warn) {
    return {
      ring: 'border-amber-500/40 bg-amber-500/10',
      text: 'text-amber-200',
      label: 'text-amber-300/80',
    };
  }
  return { ring: 'border-hir-border bg-hir-surface', text: 'text-hir-fg', label: 'text-hir-muted-fg' };
}

const TICK_MS = 1_000;

// Inline "how long am I in this stage" timer at the top of the order
// detail page. The chip drifts color as the stage gets long so the
// courier notices a slow restaurant or traffic without checking a
// clock. Color-drift only — no blocking, no alerts. Reduced-motion
// users still get the color cue; only the slow pulse on critical is
// suppressed (animate-pulse is CSS, browsers honor reduced-motion via
// media query on the keyframe).
export function ActiveOrderTimer({ status, since }: { status: string; since: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [since]);

  const label = STATUS_LABEL[status];
  if (!label || !since) return null;

  const sinceMs = new Date(since).getTime();
  if (!Number.isFinite(sinceMs)) return null;
  const elapsedMs = Math.max(0, now - sinceMs);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const elapsed = formatElapsed(elapsedMs);

  const tone = toneFor(status, elapsedSec);
  const isCritical = elapsedSec >= (THRESHOLDS[status]?.crit ?? Infinity);

  return (
    <div
      role="status"
      aria-label={`${label} ${elapsed}`}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${tone.ring}`}
    >
      <Clock
        className={`h-3.5 w-3.5 ${tone.label} ${isCritical ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      <span className={tone.label}>{label}</span>
      <span className={`font-semibold tabular-nums ${tone.text}`}>{elapsed}</span>
    </div>
  );
}
