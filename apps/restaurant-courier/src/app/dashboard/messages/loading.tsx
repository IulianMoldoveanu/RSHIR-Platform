// Skeleton for /dashboard/messages. Mimics the conversation-list layout.

export default function MessagesLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="h-5 w-24 animate-pulse rounded bg-zinc-800" />
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-zinc-800" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-800" />
                <div className="h-3 w-12 animate-pulse rounded bg-zinc-800/70" />
              </div>
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-zinc-800/70" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
