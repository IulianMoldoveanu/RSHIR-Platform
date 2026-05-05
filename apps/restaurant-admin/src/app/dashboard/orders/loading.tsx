import { Skeleton } from '@hir/ui';

// Orders list skeleton. Mirrors the real layout: heading, status filter
// chips, then a table of order rows. The realtime subscriber takes over
// once the SSR fetch resolves, so this only flashes briefly on first
// navigation into /dashboard/orders.

export default function OrdersLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      {/* Orders table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="hidden border-b border-zinc-200 bg-zinc-50 px-4 py-2 sm:grid sm:grid-cols-[110px_1fr_120px_100px_90px] sm:gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="divide-y divide-zinc-100">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[110px_1fr_120px_100px_90px] sm:items-center sm:gap-4"
            >
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-full max-w-xs" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
