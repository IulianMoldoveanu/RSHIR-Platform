// Rider orders-list skeleton. Mirrors the actual layout of
// /dashboard/orders so the page doesn't flash a blank screen between
// nav + first paint — empty state + two sections of stacked cards,
// matching the real DOM hierarchy so layout shift on hydration is
// minimal. animate-pulse + zinc-800 placeholders match the dark
// courier theme.

function SectionPlaceholder({ rows }: { rows: number }) {
  return (
    <section>
      <div className="mb-3 h-3 w-32 animate-pulse rounded bg-zinc-800/70" />
      <ul className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i}>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-zinc-800" />
                  <div className="h-3.5 w-28 animate-pulse rounded bg-zinc-800" />
                  <div className="h-4 w-12 animate-pulse rounded-full bg-zinc-800/70" />
                </div>
                <div className="h-4 w-16 animate-pulse rounded-full bg-zinc-800" />
              </div>
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-zinc-800/70" />
              <div className="mt-3 flex items-center gap-3">
                <div className="h-6 w-16 animate-pulse rounded-lg bg-zinc-800" />
                <div className="h-3 w-10 animate-pulse rounded bg-zinc-800/70" />
                <div className="ml-auto h-3.5 w-20 animate-pulse rounded bg-zinc-800/80" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function OrdersLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="h-5 w-20 animate-pulse rounded bg-zinc-800" />
        <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800/70" />
      </div>
      <SectionPlaceholder rows={2} />
      <SectionPlaceholder rows={3} />
    </div>
  );
}
