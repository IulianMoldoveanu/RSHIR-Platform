// Courier dashboard skeleton. Dark theme matches the courier app body
// (`bg-zinc-950 text-zinc-100`). The real page is a full-screen map +
// floating cards; the skeleton renders a soft grid placeholder for the
// map area plus header/active-order placeholders so the courier never
// sees a blank screen on first navigation.

export default function CourierDashboardLoading() {
  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
      {/* Faux map area */}
      <div
        aria-hidden
        className="absolute inset-0 animate-pulse bg-zinc-900"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Top earnings bar placeholder */}
      <div className="absolute inset-x-0 top-0 z-10 px-3 pt-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/85 p-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-800" />
              <div className="space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-zinc-800/70" />
              </div>
            </div>
            <div className="h-7 w-20 animate-pulse rounded-full bg-zinc-800" />
          </div>
        </div>
      </div>

      {/* Active order card placeholder */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-24">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/85 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-800" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800/70" />
          </div>
          <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-zinc-800" />
        </div>
      </div>

      {/* Bottom nav placeholder */}
      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-around">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 py-1">
              <div className="h-5 w-5 animate-pulse rounded bg-zinc-800" />
              <div className="h-2.5 w-12 animate-pulse rounded bg-zinc-800/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
