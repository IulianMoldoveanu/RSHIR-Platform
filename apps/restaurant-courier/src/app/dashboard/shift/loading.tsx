// Shift page skeleton. Real page renders: current-shift status card,
// today summary card, recent-shifts list. Same vertical rhythm so the
// rider sees the page identity before the DB read completes.

export default function ShiftLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <div className="h-5 w-24 animate-pulse rounded bg-zinc-800" />
        <div className="mt-1.5 h-3 w-48 animate-pulse rounded bg-zinc-800/60" />
      </div>

      {/* Current shift card */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-800/60" />
        <div className="mt-3 h-6 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mt-2 h-3 w-40 animate-pulse rounded bg-zinc-800/60" />
      </section>

      {/* Today summary tiles */}
      <section className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-800/60" />
            <div className="mt-2 h-6 w-12 animate-pulse rounded bg-zinc-800" />
          </div>
        ))}
      </section>

      {/* Recent shifts list */}
      <section>
        <div className="mb-3 h-3 w-40 animate-pulse rounded bg-zinc-800/70" />
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-800" />
                <div className="mt-1 h-3 w-24 animate-pulse rounded bg-zinc-800/60" />
              </div>
              <div className="h-4 w-12 animate-pulse rounded bg-zinc-800/60" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
