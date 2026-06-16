// B2B Marketplace — delivery window pill.
//
// Stream 7/9 (shared UI). Renders the `delivery_window_start..end` range as
// a compact pill: "16 iun · 14:00 → 16:00" plus a relative hint that flips
// label as the window approaches and elapses:
//   - more than 1h away   → "începe în 2h"
//   - less than 1h away   → "începe în 45 min"
//   - currently in window → "în desfășurare"
//   - past the end        → "fereastră expirată"
//
// The relative label is computed against `Date.now()` at render time — fine
// because the marketplace pages are all `force-dynamic` server components,
// so each request re-renders the pill freshly. There is no client-side
// ticker (would require a 'use client' boundary and would re-render on
// every minute change — unnecessary for the page lifetime).

import * as React from 'react';

export interface ETAPillProps {
  startIso: string;
  endIso: string;
  /** Optional "now" override for tests; defaults to Date.now(). */
  nowMs?: number;
  className?: string;
}

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '—';

  const dateFmt = new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: 'short',
  });
  const timeFmt = new Intl.DateTimeFormat('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // If start and end share a calendar day (in Europe/Bucharest wall-clock,
  // which the ro-RO formatter applies), show the date once and just the
  // two times. Otherwise expand to "DD lun HH:MM → DD lun HH:MM".
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (sameDay) {
    return `${dateFmt.format(start)} · ${timeFmt.format(start)} → ${timeFmt.format(end)}`;
  }
  return `${dateFmt.format(start)} ${timeFmt.format(start)} → ${dateFmt.format(end)} ${timeFmt.format(end)}`;
}

function relativeLabel(startMs: number, endMs: number, nowMs: number): { text: string; cls: string } {
  if (nowMs >= endMs) {
    return { text: 'fereastră expirată', cls: 'text-slate-500' };
  }
  if (nowMs >= startMs) {
    return { text: 'în desfășurare', cls: 'text-emerald-600' };
  }
  const diffSec = Math.max(0, Math.floor((startMs - nowMs) / 1000));
  if (diffSec < 60) return { text: 'începe acum', cls: 'text-emerald-600' };
  if (diffSec < 3600) return { text: `începe în ${Math.floor(diffSec / 60)} min`, cls: 'text-amber-600' };
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return { text: `începe în ${h}h`, cls: 'text-amber-600' };
  }
  const days = Math.floor(diffSec / 86400);
  return { text: `începe în ${days}z`, cls: 'text-zinc-500' };
}

export function ETAPill({ startIso, endIso, nowMs, className }: ETAPillProps): JSX.Element {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const now = typeof nowMs === 'number' ? nowMs : Date.now();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return (
      <span
        className={[
          'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs ring-1 ring-inset ring-slate-200',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="text-slate-500">—</span>
      </span>
    );
  }

  const rel = relativeLabel(startMs, endMs, now);

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs ring-1 ring-inset ring-zinc-200',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="tabular-nums text-zinc-700">{formatRange(startIso, endIso)}</span>
      <span aria-hidden className="text-zinc-300">·</span>
      <span className={rel.cls}>{rel.text}</span>
    </span>
  );
}
