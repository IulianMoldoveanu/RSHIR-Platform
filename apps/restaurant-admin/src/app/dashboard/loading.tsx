import { Skeleton } from '@hir/ui';

// Dashboard overview skeleton. Note: the page itself uses Suspense + inline
// skeletons for KPI / orders / reservations panels (see page.tsx); this
// top-level loading.tsx covers the very first SSR pass before any of
// those Suspense islands stream in, so the user never sees a blank canvas.

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      {/* KPI tiles (4) */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200 bg-white p-4"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </section>

      {/* Active orders panel */}
      <section>
        <Skeleton className="mb-2 h-4 w-40" />
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Side-by-side: COD pending + Today reservations */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <section key={col}>
            <Skeleton className="mb-2 h-4 w-32" />
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3"
                  >
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
