'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

// 2026-06-15 — Auto-refresh server-rendered snapshot every 30s so the live
// dispatch widgets stay fresh without a WebSocket. router.refresh() re-runs
// the server component without a full page load, preserving scroll + state.

export function DispatchAutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastTick, setLastTick] = useState<Date | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      startTransition(() => {
        router.refresh();
        setLastTick(new Date());
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  function manualRefresh() {
    startTransition(() => {
      router.refresh();
      setLastTick(new Date());
    });
  }

  return (
    <button
      type="button"
      onClick={manualRefresh}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
    >
      <RefreshCw className={`h-3 w-3 ${pending ? 'animate-spin' : ''}`} aria-hidden />
      {pending ? 'Se actualizeaza' : 'Reimprospateaza'}
      {lastTick ? (
        <span className="ml-1 text-[10px] text-zinc-400">({lastTick.toLocaleTimeString('ro-RO')})</span>
      ) : null}
    </button>
  );
}
