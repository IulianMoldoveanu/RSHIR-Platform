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
      className="fixed bottom-24 left-1/2 z-[1400] flex max-w-xs -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/90 px-4 py-3 text-left shadow-lg backdrop-blur active:scale-[0.98]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
        <Star className="h-5 w-5 text-amber-400" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-amber-100">
          {count} livrări reușite la rând!
        </p>
        <p className="mt-0.5 text-xs text-amber-300/80">
          Performanta excelenta. Multumim!
        </p>
      </div>
    </button>
  );
}
