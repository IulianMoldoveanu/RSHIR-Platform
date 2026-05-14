// Fleet earnings skeleton. Real page shows: total earnings card, courier
// breakdown table, period selector. The grid + table rhythm tells the
// dispatcher the page is loading actual rows, not a config error.

export default function FleetEarningsLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <div className="h-5 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mt-1.5 h-3 w-56 animate-pulse rounded bg-zinc-800/60" />
      </div>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-center"
          >
            <div className="mx-auto h-3 w-12 animate-pulse rounded bg-zinc-800/60" />
            <div className="mx-auto mt-2 h-5 w-16 animate-pulse rounded bg-zinc-800" />
            <div className="mx-auto mt-1 h-3 w-8 animate-pulse rounded bg-zinc-800/60" />
          </div>
        ))}
      </section>

      <section>
        <div className="mb-3 h-3 w-44 animate-pulse rounded bg-zinc-800/70" />
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-zinc-800" />
                <div className="min-w-0">
                  <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
                  <div className="mt-1 h-3 w-20 animate-pulse rounded bg-zinc-800/60" />
                </div>
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-zinc-800" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
