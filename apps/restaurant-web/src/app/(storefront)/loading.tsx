import { Skeleton } from '@hir/ui';

// Storefront menu page skeleton (audit §Loading states P0). Shown while
// the server fetches the tenant + menu on first load. Mirrors the real
// layout: cover banner, header row, sticky-tabs strip, then 2 sections
// with 3 ghost rows each.

export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-purple-700/25 via-purple-500/10 to-purple-300/5 sm:h-56">
        <Skeleton className="h-full w-full bg-zinc-100/0" />
      </div>
      <div className="flex items-end gap-3 px-4 pb-3 pt-3 sm:gap-4">
        <Skeleton className="-mt-10 h-20 w-20 rounded-2xl border-4 border-white sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>

      <div className="mt-2 flex gap-2 px-4">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>

      <div className="mt-4 px-4">
        <Skeleton className="h-10 w-full rounded-full" />
      </div>

      {[0, 1].map((s) => (
        <div key={s} className="mt-6 px-4">
          <Skeleton className="h-5 w-32" />
          <div className="mt-3 grid grid-cols-1 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-stretch gap-3 rounded-2xl border border-zinc-200 bg-white p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-7 w-20 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-24 w-24 rounded-xl sm:h-28 sm:w-28" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
