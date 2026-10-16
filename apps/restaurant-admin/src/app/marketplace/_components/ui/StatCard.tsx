// B2B Marketplace (admin / light) — KPI tile (spec §2.4).
//
// Preview `.kpi`: top mov accent bar, micro-label, text-2xl font-black
// tabular-nums value in brand ink, optional delta (green up / red down /
// slate neutral) with an inline arrow, optional `placeholder` ribbon
// "se cablează post-MVP" for the oversight GMV/fee tiles that wire later.

import * as React from 'react';
import { cn } from '@hir/ui';

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
  placeholder?: boolean;
  className?: string;
}

const DELTA_STYLE: Record<StatCardDelta['dir'], string> = {
  up: 'text-emerald-600',
  down: 'text-rose-600',
  neutral: 'text-slate-500',
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
      {dir === 'up' && <path d="M12 19V5M6 11l6-6 6 6" />}
      {dir === 'down' && <path d="M12 5v14M6 13l6 6 6-6" />}
      {dir === 'neutral' && <path d="M5 12h14" />}
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
      className={cn(
        'relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
        'before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-[#6b1f8a] before:to-[#8e3bb0] before:content-[""]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {icon ? <span className="text-[#6b1f8a]">{icon}</span> : null}
      </div>
      <div className="mt-2 text-2xl font-black tabular-nums text-[#23093a]">{value}</div>
      {delta ? (
        <div
          className={cn('mt-1 inline-flex items-center gap-1 text-xs font-medium', DELTA_STYLE[delta.dir])}
        >
          <DeltaArrow dir={delta.dir} />
          <span className="tabular-nums">{delta.text}</span>
        </div>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {placeholder ? (
        <span className="mt-2 inline-flex items-center rounded-full bg-[#f7f0fb] px-2 py-0.5 text-[11px] font-semibold text-[#6b1f8a] ring-1 ring-inset ring-[#e9d5f0]">
          se cablează post-MVP
        </span>
      ) : null}
    </div>
  );
}
