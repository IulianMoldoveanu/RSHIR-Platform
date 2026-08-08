// B2B Marketplace (admin / light) — loading placeholders (spec §2.8).
//
// Used by Next.js loading.tsx route files (pure presentation, safe). Admin
// surface = pulsing slate-200. SkeletonCard mirrors the resting Card shape
// (rounded-2xl border) so the loading state doesn't jump on hydrate.

import * as React from 'react';
import { cn } from '@hir/ui';

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return <div className={cn('animate-pulse rounded bg-slate-200', className)} aria-hidden />;
}

export interface SkeletonCardProps {
  rows?: number;
  className?: string;
}

export function SkeletonCard({ rows = 3, className }: SkeletonCardProps): JSX.Element {
  return (
    <div
      className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}
      aria-hidden
    >
      <Skeleton className="h-5 w-2/3" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3.5', i === rows - 1 ? 'w-1/2' : 'w-full')} />
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}
