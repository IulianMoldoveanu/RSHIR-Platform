// Fleet overview skeleton. Real page has: stats grid, live courier map,
// recent orders section. Placeholder mirrors the vertical rhythm so
// the dispatcher sees the page shape during the initial fetch, not a
// blank canvas.

export default function FleetOverviewLoading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      {/* Hero greeting strip */}
      <div>
        <div className="h-6 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="mt-2 h-3 w-72 animate-pulse rounded bg-zinc-800/60" />
      </div>

      {/* Stats grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="h-3 w-20 animate-pulse rounded bg-zinc-800/60" />
            <div className="mt-3 h-6 w-16 animate-pulse rounded bg-zinc-800" />
            <div className="mt-2 h-3 w-10 animate-pulse rounded bg-zinc-800/60" />
          </div>
        ))}
      </section>

      {/* Live map placeholder */}
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="h-64 w-full animate-pulse bg-zinc-800/40 sm:h-80" />
      </section>

      {/* Recent orders */}
      <section>
        <div className="mb-3 h-3 w-44 animate-pulse rounded bg-zinc-800/70" />
        <ul className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"
            >
              <div className="flex items-center gap-2">
                <div className="h-4 w-16 animate-pulse rounded-full bg-zinc-800" />
                <div className="h-3.5 w-24 animate-pulse rounded bg-zinc-800/70" />
              </div>
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-zinc-800/60" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
