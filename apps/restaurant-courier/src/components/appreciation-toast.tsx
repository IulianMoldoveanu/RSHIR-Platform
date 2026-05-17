'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { custom as hapticCustom } from '@/lib/haptics';

type Props = {
  count: number;
  onDismiss: () => void;
};

/**
 * Celebration banner that appears briefly after a delivery milestone
 * (every 10 consecutive successful deliveries). Auto-dismisses after 4s;
 * the rider can also tap to dismiss early.
 *
 * Deliberately avoids emojis in the code to match project style — the
 * message copy is celebratory but professional.
 */
export function AppreciationToast({ count, onDismiss }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    hapticCustom([50, 100, 50]);
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-live="polite"
      onClick={() => { setVisible(false); onDismiss(); }}
      className="fixed bottom-24 left-1/2 z-[1400] flex max-w-xs -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/90 px-4 py-3 text-left shadow-xl shadow-amber-500/30 ring-1 ring-inset ring-amber-500/20 backdrop-blur transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-500/40">
        <Star className="h-5 w-5 text-amber-300 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]" aria-hidden strokeWidth={2.25} />
      </span>
      <div>
        <p className="text-sm font-semibold text-amber-100">
          {count} livrări reușite la rând!
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-200/90">
          Performanță excelentă. Mulțumim!
        </p>
      </div>
    </button>
  );
}
