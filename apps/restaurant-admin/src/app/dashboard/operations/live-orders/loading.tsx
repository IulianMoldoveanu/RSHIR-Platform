export default function LiveOrdersLoading() {
  return (
    <div className="flex flex-col gap-5 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="h-6 w-40 rounded bg-zinc-200" />
          <div className="h-4 w-64 rounded bg-zinc-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-48 rounded-md bg-zinc-200" />
          <div className="h-8 w-20 rounded-md bg-zinc-200" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-1 min-w-[120px] h-20 rounded-xl border border-zinc-200 bg-zinc-100" />
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-zinc-200" />
        ))}
      </div>

      {/* Content area */}
      <div className="flex gap-5">
        <div className="flex flex-1 flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-zinc-200 bg-zinc-100" />
          ))}
        </div>
        <div className="hidden w-96 flex-col gap-4 lg:flex">
          <div className="h-80 rounded-xl border border-zinc-200 bg-zinc-100" />
          <div className="h-48 rounded-xl border border-zinc-200 bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}
