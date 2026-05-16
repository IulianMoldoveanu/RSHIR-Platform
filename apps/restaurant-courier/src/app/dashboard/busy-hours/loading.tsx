import { Fragment } from 'react';

// Skeleton for /dashboard/busy-hours. 7x14 grid (days x hours 8-21)
// matches the real heatmap so layout shift is zero.

export default function BusyHoursLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="h-5 w-40 animate-pulse rounded bg-zinc-800" />
      <div className="h-3 w-60 animate-pulse rounded bg-zinc-800/70" />
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="grid min-w-[420px] grid-cols-[auto_repeat(7,1fr)] gap-1">
          <div />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={`d${i}`} className="h-3 animate-pulse rounded bg-zinc-800/70" />
          ))}
          {Array.from({ length: 14 }).map((_, h) => (
            <Fragment key={`row-${h}`}>
              <div className="h-3 w-6 animate-pulse rounded bg-zinc-800/70" />
              {Array.from({ length: 7 }).map((_, d) => (
                <div
                  key={`c-${h}-${d}`}
                  className="h-5 animate-pulse rounded bg-zinc-800/60"
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
