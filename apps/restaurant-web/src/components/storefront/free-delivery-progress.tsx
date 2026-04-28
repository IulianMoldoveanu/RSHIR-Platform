'use client';

import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { useCart } from '@/lib/cart/provider';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

/**
 * Always-visible free-delivery progress pill (Feature S1).
 *
 * Lives between the cover photo and the menu so the customer sees their
 * progress without opening the cart. Hides itself when:
 *   - tenant has no free_delivery_threshold configured (threshold = 0)
 *   - cart is empty (no point distracting before they add anything)
 *
 * Source of truth is the same Zustand cart store the cart drawer reads
 * — values stay in lockstep automatically.
 */
export function FreeDeliveryProgress({
  thresholdRon,
  locale,
}: {
  thresholdRon: number;
  locale: Locale;
}) {
  const useCartStore = useCart();
  const [hydrated, setHydrated] = useState(false);
  const subtotal = useCartStore((s) => (hydrated ? s.getSubtotal() : 0));
  const count = useCartStore((s) => (hydrated ? s.getCount() : 0));

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (thresholdRon <= 0) return null;
  if (!hydrated || count === 0) return null;

  const remaining = Math.max(0, thresholdRon - subtotal);
  const reached = remaining === 0;
  const pct = Math.min(100, Math.round((subtotal / thresholdRon) * 100));

  return (
    <div className="mx-auto mt-3 max-w-2xl px-4">
      <div
        className={`rounded-full border px-4 py-2 transition-colors ${
          reached
            ? 'border-emerald-200 bg-emerald-50 animate-pulse'
            : 'border-zinc-200 bg-white'
        }`}
      >
        <div className="flex items-center gap-2">
          <Truck
            className={`h-4 w-4 shrink-0 ${reached ? 'text-emerald-600' : 'text-zinc-500'}`}
            aria-hidden
          />
          <span
            className={`flex-1 text-xs font-medium ${
              reached ? 'text-emerald-800' : 'text-zinc-700'
            }`}
          >
            {reached
              ? `🎉 ${t(locale, 'cart.free_delivery_reached')}`
              : t(locale, 'cart.free_delivery_progress_template', {
                  amount: formatRon(remaining, locale),
                })}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              reached ? 'bg-emerald-500' : 'bg-[var(--hir-brand)]'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
