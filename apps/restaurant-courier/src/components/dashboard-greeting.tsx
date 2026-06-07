'use client';

import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

const AUTO_DISMISS_MS = 12_000; // auto-hide after 12s so it doesn't hog the map

/**
 * Wraps the top-left greeting card on the rider map so it auto-dismisses after
 * a few seconds (it's purely informational) and can be closed manually via an X
 * button. Keeps the exact visual of the previous static card.
 */
export function DashboardGreeting({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[62%] overflow-hidden rounded-2xl border border-hir-border bg-hir-bg/90 shadow-lg shadow-violet-500/10 ring-1 ring-inset ring-hir-border/40 backdrop-blur">
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Închide"
        className="pointer-events-auto absolute right-1.5 top-1.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md text-hir-muted-fg transition-colors hover:bg-hir-surface/60 hover:text-hir-fg"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <div className="pointer-events-auto pr-7">{children}</div>
    </div>
  );
}
