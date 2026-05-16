// Skeleton for /dashboard/history. Mirrors the trip-row layout so there
// is no layout shift on hydration. 8 placeholder rows matches the most
// common "first page" length the rider sees.

export default function HistoryLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="h-5 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-20 animate-pulse rounded bg-zinc-800/70" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
          >
            <div className="h-3 w-12 animate-pulse rounded bg-zinc-800" />
            <div className="mt-2 h-5 w-14 animate-pulse rounded bg-zinc-800/80" />
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
          >
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-zinc-800" />
            <div className="min-w-0 flex-1">
              <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-800" />
              <div className="mt-2 h-3 w-48 animate-pulse rounded bg-zinc-800/70" />
            </div>
            <div className="h-3.5 w-12 animate-pulse rounded bg-zinc-800" />
          </li>
        ))}
      </ul>
    </div>
  );
}
