// B2B Marketplace (courier dark theme) — Skeleton primitives.
//
// Used by Next.js `loading.tsx` route files (pure presentation, safe). On the
// dark surface the pulsing fill is `bg-white/5`. `SkeletonCard` renders a
// card-shaped placeholder (title bar + N body lines + footer) matching the
// real card geometry so the layout doesn't shift on load.

import * as React from 'react';

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return (
    <span
      aria-hidden
      className={['block animate-pulse rounded bg-white/5', className ?? '']
        .filter(Boolean)
        .join(' ')}
    />
  );
}

export interface SkeletonCardProps {
  /** Number of body lines. Defaults to 3. */
  rows?: number;
  className?: string;
}

export function SkeletonCard({ rows = 3, className }: SkeletonCardProps): JSX.Element {
  return (
    <div
      aria-hidden
      className={['rounded-2xl border border-hir-border bg-hir-surface p-4', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={['h-3', i === rows - 1 ? 'w-2/3' : 'w-full'].join(' ')} />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>
  );
}
