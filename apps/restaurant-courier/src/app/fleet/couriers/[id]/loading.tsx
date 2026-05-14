// Per-courier detail skeleton. Real page shows profile header + lifetime
// stats + this-week stats + recent deliveries list.

export default function FleetCourierDetailLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="h-3 w-32 animate-pulse rounded bg-zinc-800/60" />

      {/* Profile header */}
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-zinc-800" />
        <div className="min-w-0 flex-1">
          <div className="h-5 w-1/2 animate-pulse rounded bg-zinc-800" />
          <div className="mt-1.5 h-3 w-1/3 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="h-7 w-20 animate-pulse rounded-full bg-zinc-800/70" />
      </div>

      {/* Stat grid */}
      <section className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
          >
            <div className="h-3 w-12 animate-pulse rounded bg-zinc-800/60" />
            <div className="mt-2 h-5 w-10 animate-pulse rounded bg-zinc-800" />
          </div>
        ))}
      </section>

      {/* Recent deliveries */}
      <section>
        <div className="mb-3 h-3 w-40 animate-pulse rounded bg-zinc-800/70" />
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-zinc-800" />
                <div className="mt-1 h-3 w-1/2 animate-pulse rounded bg-zinc-800/60" />
              </div>
              <div className="h-4 w-14 animate-pulse rounded bg-zinc-800/60" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
