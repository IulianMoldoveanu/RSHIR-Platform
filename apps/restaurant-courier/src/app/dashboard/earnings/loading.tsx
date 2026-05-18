// Rider earnings skeleton. Real page renders period totals + a list
// of recent deliveries with payout breakdown — placeholders cover
// both regions so the rider sees something material while the
// aggregate queries (which can be slow on big shifts) resolve.

export default function EarningsLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="h-5 w-24 animate-pulse rounded bg-hir-border" />

      {/* Period totals card */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-5">
        <div className="h-3 w-20 animate-pulse rounded bg-hir-border/70" />
        <div className="mt-2 h-9 w-32 animate-pulse rounded bg-hir-border" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className="h-3 w-12 animate-pulse rounded bg-hir-border/70" />
              <div className="mt-1 h-5 w-16 animate-pulse rounded bg-hir-border" />
            </div>
          ))}
        </div>
      </section>

      {/* List header */}
      <div className="h-3 w-32 animate-pulse rounded bg-hir-border/70" />

      {/* Delivery rows */}
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i}>
            <div className="rounded-xl border border-hir-border bg-hir-surface p-3">
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-32 animate-pulse rounded bg-hir-border" />
                <div className="h-4 w-16 animate-pulse rounded bg-hir-border/80" />
              </div>
              <div className="mt-1.5 h-2.5 w-40 animate-pulse rounded bg-hir-border/60" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
