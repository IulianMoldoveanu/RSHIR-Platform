'use client';

import { useEffect, useState } from 'react';
import { Bike, Store } from 'lucide-react';
import { useCart } from '@/lib/cart/provider';
import type { Fulfillment } from '@/lib/cart/store';
import { t, type Locale } from '@/lib/i18n';

// Delivery / pickup, asked above the menu.
//
// Added to the real storefront 2026-08-03. It existed on the marketing demo
// first, which is backwards — the demo was promising a choice the product only
// offered three screens later, at checkout. Iulian, shown the parity audit:
// "adauga l in storefrontul real".
//
// The checkout picker stays exactly as it is and still wins. This only decides
// what checkout opens on, which matters because by then the diner has already
// built a basket priced as if it were being delivered.
//
// Labels come from the same `checkout.fulfillment_*` keys the checkout picker
// uses, so the two cannot describe the same choice differently.

export function FulfillmentSwitch({
  locale,
  pickupEtaMinutes = 0,
}: {
  locale: Locale;
  /**
   * Tenant's configured pickup ETA. 0 falls back to "no delivery fee" rather
   * than inventing a number.
   *
   * There is no delivery counterpart on purpose. The header already shows the
   * delivery ETA as a chip a few pixels above, and rendering it again here read
   * as two different answers — "Livrare 25–40 min" over "Livrare · ~25 min".
   * Pickup's ETA is not shown anywhere else, so it earns its place.
   */
  pickupEtaMinutes?: number;
}) {
  const useCartStore = useCart();
  const stored = useCartStore((s) => s.fulfillment);
  const setFulfillment = useCartStore((s) => s.setFulfillment);

  // The choice is persisted, so the server renders DELIVERY and a returning
  // customer's client may not. Hold the default for one render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const fulfillment: Fulfillment = hydrated ? stored : 'DELIVERY';

  // Honest hints only. The delivery fee is zone-based and unknown until an
  // address is entered, so it is never stated here; pickup genuinely has no
  // delivery fee (`deliveryFeeRon: 0` in the quote), so that one is safe.
  const options: Array<{ value: Fulfillment; label: string; hint: string | null; Icon: typeof Bike }> = [
    {
      value: 'DELIVERY',
      label: t(locale, 'checkout.fulfillment_delivery'),
      hint: null,
      Icon: Bike,
    },
    {
      value: 'PICKUP',
      label: t(locale, 'checkout.fulfillment_pickup'),
      hint:
        pickupEtaMinutes > 0
          ? t(locale, 'checkout.fulfillment_eta_template', {
              minutes: String(pickupEtaMinutes),
            })
          : t(locale, 'checkout.fulfillment_pickup_no_fee'),
      Icon: Store,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 pb-1">
      <div
        role="radiogroup"
        aria-label={t(locale, 'checkout.section_fulfillment')}
        className="grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5"
      >
        {options.map(({ value, label, hint, Icon }) => {
          const active = fulfillment === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFulfillment(value)}
              // Label and hint stack rather than sitting inline: side by side
              // at 390px the pickup option wrapped mid-phrase and the control
              // looked broken. Same lesson as the demo switch.
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hir-brand,#7c3aed)] ${
                active
                  ? 'bg-[var(--hir-brand,#7c3aed)] text-white'
                  : 'text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <span
                className={`flex items-center gap-1.5 whitespace-nowrap text-sm ${
                  active ? 'font-semibold' : 'font-medium'
                }`}
              >
                <Icon className="h-4 w-4 flex-none" aria-hidden />
                {label}
              </span>
              {hint && (
                <span className={`text-[11px] ${active ? 'text-white/80' : 'text-zinc-400'}`}>
                  {hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
