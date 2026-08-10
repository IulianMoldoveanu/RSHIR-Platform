// B2B Marketplace (courier dark theme) — VerticalBadge.
//
// Maps the raw `vertical` enum to a ro-RO label + hue (§2.6), fixing the
// raw-enum leak (e.g. "pharmacy" rendered via `capitalize`). Same enum→label
// mapping as the admin side; dark-tuned translucent chips here so the pill
// reads on the near-black surface.
//
//   restaurant → "Restaurant" (orange)
//   pharmacy   → "Farmacie"   (emerald)
//   retail     → "Retail"     (violet — brand)
//   other      → "Alt tip"    (slate)
//
// Unknown values fall back to the "other" slate chip with a Title-cased label
// so nothing renders the raw lowercase enum.

import * as React from 'react';

export interface VerticalBadgeProps {
  vertical: string;
  className?: string;
}

const VERTICAL_STYLE: Record<string, { label: string; cls: string }> = {
  restaurant: { label: 'Restaurant', cls: 'bg-orange-500/15 text-orange-300 ring-orange-500/30' },
  pharmacy: { label: 'Farmacie', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  retail: { label: 'Retail', cls: 'bg-violet-500/15 text-violet-300 ring-violet-500/30' },
  other: { label: 'Alt tip', cls: 'bg-slate-500/15 text-slate-300 ring-slate-500/30' },
};

function titleCase(value: string): string {
  if (!value) return 'Alt tip';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function VerticalBadge({ vertical, className }: VerticalBadgeProps): JSX.Element {
  const key = vertical?.toLowerCase?.() ?? '';
  const style = VERTICAL_STYLE[key] ?? {
    label: titleCase(vertical),
    cls: VERTICAL_STYLE.other.cls,
  };
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        style.cls,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {style.label}
    </span>
  );
}
