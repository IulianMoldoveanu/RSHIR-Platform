import { Skeleton } from '@hir/ui';

// Top-level loading skeleton for /partner-portal/*. Mirrors the layout
// of the polished landing page so the first SSR pass doesn't look
// empty: hero band, quick-action bar, unlock card, 6-tile KPI strip.

export default function PartnerPortalLoading() {
  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      {/* Hero */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-3 h-4 w-72" />
        <Skeleton className="mt-2 h-3 w-48" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5"
          >
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-1 h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* Unlock card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="mt-2 h-3 w-full max-w-md" />
      </div>

      {/* KPI strip (6 tiles) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 bg-white p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-6 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
