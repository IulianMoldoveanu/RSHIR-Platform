// Skeleton for /dashboard/diagnostics. The page renders a series of
// device-check cards; the placeholder matches that card geometry so
// the screen stays calm during hydration.

export default function DiagnosticsLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="h-5 w-32 animate-pulse rounded bg-zinc-800" />
      <div className="h-3 w-72 animate-pulse rounded bg-zinc-800/70" />
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-zinc-800" />
            <div className="min-w-0 flex-1">
              <div className="h-3.5 w-40 animate-pulse rounded bg-zinc-800" />
              <div className="mt-2 h-3 w-56 animate-pulse rounded bg-zinc-800/70" />
            </div>
            <div className="h-5 w-12 animate-pulse rounded-full bg-zinc-800/80" />
          </li>
        ))}
      </ul>
    </div>
  );
}
