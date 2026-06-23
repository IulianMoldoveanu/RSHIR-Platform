// B2B Marketplace (courier dark theme) — StatCard KPI tile.
//
// Replaces the inline `Kpi`/`KpiCard` helpers (§2.4). Dark KPI tile: violet
// top accent hairline, micro-label, big tabular-nums value, optional hint,
// optional delta (up=emerald / down=rose / neutral=slate), optional
// "se cablează post-MVP" placeholder ribbon for not-yet-wired metrics.
//
// `icon` is rendered verbatim — callers pass a lucide glyph at strokeWidth
// 1.75 (lucide is the courier icon system). The tile only styles the slot.

import * as React from 'react';

export interface StatCardDelta {
  dir: 'up' | 'down' | 'neutral';
  text: string;
}

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
  delta?: StatCardDelta;
  /** Renders a muted "se cablează post-MVP" ribbon over the value. */
  placeholder?: boolean;
  className?: string;
}

const DELTA_STYLE: Record<StatCardDelta['dir'], string> = {
  up: 'text-emerald-400',
  down: 'text-rose-400',
  neutral: 'text-hir-muted-fg',
};

function DeltaArrow({ dir }: { dir: StatCardDelta['dir'] }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
      aria-hidden
      focusable="false"
    >
      {dir === 'up' ? (
        <path d="M7 14l5-5 5 5" />
      ) : dir === 'down' ? (
        <path d="M7 10l5 5 5-5" />
      ) : (
        <path d="M5 12h14" />
      )}
    </svg>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  delta,
  placeholder = false,
  className,
}: StatCardProps): JSX.Element {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-2xl border border-hir-border bg-hir-surface p-3',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-violet-600 to-violet-400"
      />
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        {icon ? <span className="text-violet-400">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </div>

      {placeholder ? (
        <p className="mt-2 inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-hir-muted-fg ring-1 ring-inset ring-hir-border">
          se cablează post-MVP
        </p>
      ) : (
        <p className="mt-1 text-2xl font-black tabular-nums text-zinc-50">{value}</p>
      )}

      <div className="mt-0.5 flex items-center gap-2">
        {delta ? (
          <span
            className={['inline-flex items-center gap-0.5 text-[11px] font-semibold', DELTA_STYLE[delta.dir]]
              .join(' ')}
          >
            <DeltaArrow dir={delta.dir} />
            <span className="tabular-nums">{delta.text}</span>
          </span>
        ) : null}
        {hint ? <span className="text-[11px] text-hir-muted-fg">{hint}</span> : null}
      </div>
    </div>
  );
}
