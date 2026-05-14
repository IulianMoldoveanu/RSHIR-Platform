// Fleet courier roster skeleton. Real page lists every courier in the
// fleet with avatar + name + vehicle + status + shift indicator.

export default function FleetCouriersLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-5 w-28 animate-pulse rounded bg-zinc-800" />
          <div className="mt-1.5 h-3 w-44 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-lg bg-zinc-800/70" />
      </div>

      <ul className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3"
          >
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-zinc-800" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-800" />
              <div className="mt-1 h-3 w-1/4 animate-pulse rounded bg-zinc-800/60" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-800/60" />
          </li>
        ))}
      </ul>
    </div>
  );
}
