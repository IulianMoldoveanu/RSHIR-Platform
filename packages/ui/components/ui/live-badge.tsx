import * as React from 'react';
import { cn } from '../../lib/cn';

/**
 * Canonical "live" badge for surfaces that auto-refresh via realtime or
 * polling. Pulsing emerald dot + uppercase "live" label.
 *
 * Used in:
 *   - admin home: "Comenzi active" header (router.refresh via postgres_changes)
 *   - admin order detail: courier mini-map (poll every 12s)
 *
 * Intentionally distinct from inline lowercase "live" text (used in chat
 * headers as low-key affordance) — the pill version is loud enough to
 * confirm "this data is fresh", quiet enough to ignore once you trust it.
 */
export interface LiveBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label?: string;
}

export function LiveBadge({ label = 'live', className, ...props }: LiveBadgeProps) {
  return (
    <span
      aria-label="Date actualizate live"
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700',
        className,
      )}
      {...props}
    >
      <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
      {label}
    </span>
  );
}
