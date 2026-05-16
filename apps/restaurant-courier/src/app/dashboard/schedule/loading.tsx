export default function ScheduleLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-hir-border" />
        <div className="h-4 w-72 animate-pulse rounded bg-hir-border" />
      </div>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-hir-border" />
      <div className="h-96 animate-pulse rounded-2xl bg-hir-border" />
      <div className="h-12 animate-pulse rounded-2xl bg-hir-border" />
    </div>
  );
}
