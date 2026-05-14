// Fleet dispatcher order-detail skeleton. Mirrors the real page:
// header, timeline, pickup, dropoff, items, totals, assignment block.

export default function FleetOrderDetailLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="h-3 w-32 animate-pulse rounded bg-zinc-800/60" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="h-6 w-40 animate-pulse rounded bg-zinc-800" />
          <div className="mt-1 h-3 w-16 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-800" />
      </div>

      {/* Timeline */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 h-3 w-32 animate-pulse rounded bg-zinc-800/70" />
        <div className="grid grid-cols-4 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-2.5 w-full animate-pulse rounded-full bg-zinc-800" />
              <div className="h-2.5 w-12 animate-pulse rounded bg-zinc-800/70" />
            </div>
          ))}
        </div>
      </section>

      {/* Pickup + dropoff */}
      {[
        'border-violet-500/20',
        'border-emerald-500/20',
      ].map((tone, i) => (
        <section key={i} className={`rounded-2xl border ${tone} bg-zinc-900 p-5`}>
          <div className="h-3 w-16 animate-pulse rounded bg-zinc-800/70" />
          <div className="mt-2 h-5 w-3/4 animate-pulse rounded bg-zinc-800" />
          <div className="mt-3 flex gap-2">
            <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800" />
            <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-800/70" />
          </div>
        </section>
      ))}

      {/* Items + total */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="h-3 w-20 animate-pulse rounded bg-zinc-800/70" />
        <ul className="mt-2 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-3.5 w-3/4 animate-pulse rounded bg-zinc-800"
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
