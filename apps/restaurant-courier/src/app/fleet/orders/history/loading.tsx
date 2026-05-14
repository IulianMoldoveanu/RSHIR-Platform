// Fleet history skeleton. Page makes 3 queries (orders + couriers +
// summary aggregate) so first paint can take 200–400ms on big fleets.
// Skeleton mirrors header, range picker, summary card + list rows.

export default function FleetHistoryLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="h-3 w-32 animate-pulse rounded bg-zinc-800/60" />
      <div>
        <div className="h-6 w-44 animate-pulse rounded bg-zinc-800" />
        <div className="mt-1.5 h-3 w-72 animate-pulse rounded bg-zinc-800/60" />
      </div>

      {/* Range picker chips */}
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-7 w-16 animate-pulse rounded-full bg-zinc-800/70"
          />
        ))}
      </div>

      {/* Per-tenant breakdown card */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-800/70" />
        <ul className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center justify-between">
              <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-800" />
              <div className="h-3.5 w-20 animate-pulse rounded bg-zinc-800/70" />
            </li>
          ))}
        </ul>
      </section>

      {/* Order rows */}
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="h-4 w-16 animate-pulse rounded-full bg-zinc-800" />
                <div className="h-4 w-20 animate-pulse rounded-full bg-zinc-800/70" />
                <div className="h-3.5 w-24 animate-pulse rounded bg-zinc-800" />
              </div>
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-zinc-800/70" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
