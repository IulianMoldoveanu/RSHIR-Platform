'use client';

import { useEffect, useState } from 'react';

function formatElapsed(startedAt: string): string {
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return '';
  const elapsedMs = Math.max(0, Date.now() - startMs);
  const totalMin = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  return `${mins}m`;
}

// Ticks once per 30 seconds — matches the LocationTracker cadence so we
// never show a "fresher" UI than the position telemetry behind it.
const TICK_MS = 30_000;

export function ShiftTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(startedAt));

  useEffect(() => {
    // Reset immediately when startedAt changes — otherwise a courier who
    // ends and restarts a shift without a full reload would see the
    // previous shift's elapsed value until the next 30s tick.
    setElapsed(formatElapsed(startedAt));
    const id = window.setInterval(() => setElapsed(formatElapsed(startedAt)), TICK_MS);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return <span className="text-zinc-500">· {elapsed}</span>;
}
