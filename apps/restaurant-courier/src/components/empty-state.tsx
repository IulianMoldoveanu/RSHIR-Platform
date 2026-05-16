import Link from 'next/link';
import type { ReactNode } from 'react';

// Shared empty-state primitive. Use whenever a list has zero items so
// the rider never sees a bare "—" or a flat dash. Same look across
// every route (history, schedule, busy-hours, etc.) so couriers learn
// the pattern once.
//
// Renders:
//   [icon disc]
//   Title (sm semibold)
//   Hint (xs muted, optional)
//   Optional CTA link
//
// Server-friendly: no client hooks. CTAs route via next/link.
export function EmptyState({
  icon,
  title,
  hint,
  ctaHref,
  ctaLabel,
  tone = 'neutral',
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  ctaHref?: string;
  ctaLabel?: string;
  tone?: 'neutral' | 'positive';
}) {
  const iconRing =
    tone === 'positive'
      ? 'bg-emerald-500/15 text-emerald-300'
      : 'bg-hir-border text-hir-muted-fg';
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-hir-border bg-hir-surface px-6 py-8 text-center">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${iconRing}`}>
        {icon}
      </span>
      <p className="text-sm font-medium text-hir-fg">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-hir-muted-fg">{hint}</p> : null}
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:border-violet-400 hover:bg-violet-500/15 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}
