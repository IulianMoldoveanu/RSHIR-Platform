import { Skeleton } from '@hir/ui';

// Checkout page skeleton. Mirrors the real layout: header strip,
// 2-column form (delivery address + cart summary stacked on mobile)
// with submit button at the bottom. animate-pulse on each placeholder.

export default function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-64" />

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* Left column: contact + delivery form */}
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <Skeleton className="h-4 w-32" />
              <div className="mt-3 space-y-3">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <Skeleton className="h-4 w-40" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md sm:col-span-2" />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <Skeleton className="h-4 w-28" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-10 flex-1 rounded-md" />
                <Skeleton className="h-10 flex-1 rounded-md" />
              </div>
            </div>
          </div>

          {/* Right column: cart summary */}
          <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <Skeleton className="h-4 w-24" />
              <div className="mt-3 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex justify-between pt-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
            </div>
            <Skeleton className="h-12 w-full rounded-xl" />
          </aside>
        </div>
      </main>
    </div>
  );
}
