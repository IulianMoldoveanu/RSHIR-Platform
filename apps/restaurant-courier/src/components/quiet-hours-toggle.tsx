'use client';

import { useEffect, useId, useState } from 'react';
import { Moon } from 'lucide-react';
import {
  DEFAULT_QUIET,
  isInsideQuietHours,
  readQuietHours,
  writeQuietHours,
  type QuietHours,
} from '@/lib/quiet-hours';
import { cardClasses } from './card';

/**
 * Settings card for the do-not-disturb window. When enabled, the offer
 * chirp (and any opt-in voice prompts) stay silent within the selected
 * time range. Default window when enabled: 22:00–07:00.
 */
export function QuietHoursToggle() {
  const toggleId = useId();
  const startId = useId();
  const endId = useId();
  const [q, setQ] = useState<QuietHours>(DEFAULT_QUIET);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setQ(readQuietHours());
    setHydrated(true);
  }, []);

  function update(patch: Partial<QuietHours>) {
    const next = { ...q, ...patch };
    setQ(next);
    writeQuietHours(next);
  }

  const inside = hydrated && isInsideQuietHours(q);

  if (!hydrated) {
    return (
      <div className={cardClasses()}>
        <div className="h-6 w-40 animate-pulse rounded bg-hir-muted" />
      </div>
    );
  }

  return (
    <div className={cardClasses({ className: 'flex flex-col gap-3' })}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 ring-1 ring-violet-500/30"
        >
          <Moon className="h-4 w-4 text-violet-300" strokeWidth={2.25} />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor={toggleId}
            className="cursor-pointer text-sm font-semibold text-hir-fg"
          >
            Ore de liniște
          </label>
          <p className="text-xs leading-relaxed text-hir-muted-fg">
            Oprește sunetul pentru oferte și anunțurile vocale în intervalul
            ales. Notificările push rămân active — doar partea audio e tăcută.
          </p>
        </div>
        <input
          id={toggleId}
          type="checkbox"
          checked={q.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="mt-1 h-5 w-5 cursor-pointer accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        />
      </div>

      {q.enabled ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={startId}
                className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
              >
                De la
              </label>
              <input
                id={startId}
                type="time"
                value={q.startHHmm}
                onChange={(e) => update({ startHHmm: e.target.value })}
                className="min-h-[44px] rounded-lg border border-hir-border bg-hir-bg px-3 text-sm tabular-nums text-hir-fg transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={endId}
                className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
              >
                Până la
              </label>
              <input
                id={endId}
                type="time"
                value={q.endHHmm}
                onChange={(e) => update({ endHHmm: e.target.value })}
                className="min-h-[44px] rounded-lg border border-hir-border bg-hir-bg px-3 text-sm tabular-nums text-hir-fg transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
          </div>

          {inside ? (
            <p className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-[11px] font-medium text-violet-100 ring-1 ring-inset ring-violet-500/20">
              Ești în interval. Sunetul este tăcut acum.
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-hir-muted-fg">
              Intervalul nu e activ acum; sunetul rulează normal.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
