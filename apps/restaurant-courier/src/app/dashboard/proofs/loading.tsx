export default function ProofsLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <div className="h-7 w-48 animate-pulse rounded-lg bg-hir-border" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded bg-hir-border/70" />
      </div>
      <div className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-hir-border" />
        <div className="mt-3 flex gap-2">
          <div className="h-9 flex-1 animate-pulse rounded-lg bg-hir-border" />
          <div className="h-9 w-12 animate-pulse rounded bg-hir-border/50" />
          <div className="h-9 flex-1 animate-pulse rounded-lg bg-hir-border" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded-xl bg-hir-border"
          />
        ))}
      </div>
    </div>
  );
}
