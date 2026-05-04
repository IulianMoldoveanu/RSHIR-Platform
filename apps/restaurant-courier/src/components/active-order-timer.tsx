'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: 'De la acceptare',
  PICKED_UP: 'De la ridicare',
  IN_TRANSIT: 'De la plecare',
};

function formatElapsed(sinceIso: string): string {
  const since = new Date(sinceIso).getTime();
  if (!Number.isFinite(since)) return '';
  const elapsedMs = Math.max(0, Date.now() - since);
  const totalSec = Math.floor(elapsedMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

const TICK_MS = 15_000;

// Small inline timer at the top of the order detail page that shows
// how long the rider has spent in the current stage. Helps a courier
// notice when something is taking longer than usual (slow restaurant,
// stuck in traffic) without needing to do mental arithmetic.
export function ActiveOrderTimer({ status, since }: { status: string; since: string | null }) {
  const [elapsed, setElapsed] = useState(() => (since ? formatElapsed(since) : ''));

  useEffect(() => {
    if (!since) {
      setElapsed('');
      return;
    }
    setElapsed(formatElapsed(since));
    const id = window.setInterval(() => setElapsed(formatElapsed(since)), TICK_MS);
    return () => window.clearInterval(id);
  }, [since]);

  const label = STATUS_LABEL[status];
  if (!label || !since) return null;

  return (
    <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-300">
      <Clock className="h-3 w-3 text-zinc-500" aria-hidden />
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-100">{elapsed}</span>
    </div>
  );
}
