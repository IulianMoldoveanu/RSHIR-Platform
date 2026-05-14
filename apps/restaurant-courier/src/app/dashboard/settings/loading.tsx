// Settings page skeleton. Real page renders profile section + vehicle
// picker + notification preferences + danger zone. Placeholder rhythms
// match the section card spacing in settings/page.tsx.

export default function SettingsLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <div className="h-5 w-20 animate-pulse rounded bg-zinc-800" />
        <div className="mt-1.5 h-3 w-44 animate-pulse rounded bg-zinc-800/60" />
      </div>

      {Array.from({ length: 4 }).map((_, i) => (
        <section
          key={i}
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
        >
          <div className="h-3 w-28 animate-pulse rounded bg-zinc-800/70" />
          <div className="mt-3 flex flex-col gap-2">
            <div className="h-9 w-full animate-pulse rounded-lg bg-zinc-800/50" />
            <div className="h-9 w-2/3 animate-pulse rounded-lg bg-zinc-800/50" />
          </div>
        </section>
      ))}
    </div>
  );
}
