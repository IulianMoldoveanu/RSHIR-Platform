// Fleet dispatcher main-view skeleton. Real page is split into
// unassigned + assigned sections, each with rows carrying status
// chip + tenant chip + courier picker. Placeholder mirrors that
// vertical rhythm so the dispatcher sees the page shape immediately.

function DispatchRowPlaceholder() {
  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-4 w-16 animate-pulse rounded-full bg-zinc-800" />
            <div className="h-4 w-20 animate-pulse rounded-full bg-zinc-800/70" />
            <div className="h-3.5 w-24 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-zinc-800/70" />
        </div>
        <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800" />
      </div>
    </li>
  );
}

export default function FleetOrdersLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-5 w-32 animate-pulse rounded bg-zinc-800" />
          <div className="mt-1.5 h-3 w-48 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800/70" />
      </div>

      <div className="h-9 w-full animate-pulse rounded-lg bg-zinc-800/60" />

      <section>
        <div className="mb-3 h-3 w-40 animate-pulse rounded bg-zinc-800/70" />
        <ul className="flex flex-col gap-3">
          <DispatchRowPlaceholder />
          <DispatchRowPlaceholder />
        </ul>
      </section>

      <section>
        <div className="mb-3 h-3 w-36 animate-pulse rounded bg-zinc-800/70" />
        <ul className="flex flex-col gap-3">
          <DispatchRowPlaceholder />
          <DispatchRowPlaceholder />
          <DispatchRowPlaceholder />
        </ul>
      </section>
    </div>
  );
}
