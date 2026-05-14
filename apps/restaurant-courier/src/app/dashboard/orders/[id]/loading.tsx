// Rider order-detail skeleton. Mirrors the real page layout — header
// chip, optional earnings preview, pickup card, timeline, dropoff
// card, items, totals — with placeholder dimensions tuned so the
// final hydrated content slots in without a visible layout jump.

export default function OrderDetailLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-5 w-24 animate-pulse rounded bg-zinc-800" />
          <div className="h-4 w-12 animate-pulse rounded-full bg-zinc-800/70" />
        </div>
        <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-800" />
      </div>

      {/* Pickup card */}
      <section className="rounded-2xl border border-violet-500/20 bg-zinc-900 p-5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-pulse rounded-full bg-violet-500/20" />
          <div className="h-3 w-16 animate-pulse rounded bg-zinc-800/70" />
        </div>
        <div className="mt-2 h-5 w-3/4 animate-pulse rounded bg-zinc-800" />
        <div className="mt-3 flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-800/70" />
        </div>
      </section>

      {/* Timeline */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4">
        <div className="grid grid-cols-4 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-2.5 w-full animate-pulse rounded-full bg-zinc-800" />
              <div className="h-2 w-12 animate-pulse rounded bg-zinc-800/70" />
            </div>
          ))}
        </div>
      </section>

      {/* Dropoff card */}
      <section className="rounded-2xl border border-emerald-500/20 bg-zinc-900 p-5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-pulse rounded-full bg-emerald-500/20" />
          <div className="h-3 w-16 animate-pulse rounded bg-zinc-800/70" />
        </div>
        <div className="mt-2 h-5 w-3/4 animate-pulse rounded bg-zinc-800" />
        <div className="mt-1 h-3 w-1/3 animate-pulse rounded bg-zinc-800/70" />
        <div className="mt-3 flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-800/70" />
        </div>
      </section>

      {/* Total */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div className="h-3 w-12 animate-pulse rounded bg-zinc-800/70" />
          <div className="h-4 w-20 animate-pulse rounded bg-zinc-800" />
        </div>
      </section>

      {/* Action button */}
      <div className="h-14 w-full animate-pulse rounded-2xl bg-zinc-800" />
    </div>
  );
}
