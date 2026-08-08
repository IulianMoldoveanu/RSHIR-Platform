// B2B Marketplace (admin / light) — vertical pill (spec §2.6).
//
// Maps the raw vertical enum to a ro-RO label + hue family, fixing the
// raw-enum leak ("pharmacy" → "Pharmacy" via capitalize) flagged in the
// audit. Pill geometry identical to the shared status badges.
//
//   restaurant → "Restaurant" (orange)
//   pharmacy   → "Farmacie"   (emerald)
//   retail     → "Retail"     (mov/violet)
//   other / *  → "Alt tip"    (slate)

import * as React from 'react';
import { cn } from '@hir/ui';

export interface VerticalBadgeProps {
  vertical: string;
  className?: string;
}

const VERTICAL_STYLE: Record<string, { label: string; cls: string }> = {
  restaurant: { label: 'Restaurant', cls: 'bg-orange-100 text-orange-800 ring-orange-200' },
  pharmacy: { label: 'Farmacie', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  retail: { label: 'Retail', cls: 'bg-[#f7f0fb] text-[#6b1f8a] ring-[#e9d5f0]' },
  other: { label: 'Alt tip', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

const FALLBACK = { label: 'Alt tip', cls: 'bg-slate-100 text-slate-700 ring-slate-200' };

export function VerticalBadge({ vertical, className }: VerticalBadgeProps): JSX.Element {
  const style = VERTICAL_STYLE[vertical?.toLowerCase()] ?? FALLBACK;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        style.cls,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
