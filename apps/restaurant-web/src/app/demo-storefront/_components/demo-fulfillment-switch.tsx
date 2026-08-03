'use client';

import { Bike, Store } from 'lucide-react';
import {
  DEMO_DELIVERY_FEE_RON,
  useDemoCartHydrated,
  useDemoCartStore,
  type DemoFulfillment,
} from '@/lib/demo/demo-cart-store';

// Delivery / pickup, the first choice a real storefront asks a diner to make.
// Added 2026-08-03 at Iulian's request ("in demo sa poata omul selecta livrare
// sau pick up") — without it the demo only ever showed half the flow.
//
// It has to actually change something or it's a prop: pickup zeroes the
// delivery fee and drops the address field at checkout, which is exactly what
// `PICKUP` does in the real quote (see `app/api/checkout/pricing.ts`).

const OPTIONS: Array<{ value: DemoFulfillment; label: string; hint: string; Icon: typeof Bike }> = [
  { value: 'DELIVERY', label: 'Livrare', hint: `+${DEMO_DELIVERY_FEE_RON} lei`, Icon: Bike },
  { value: 'PICKUP', label: 'Ridic personal', hint: 'gratuit', Icon: Store },
];

export function DemoFulfillmentSwitch() {
  const hydrated = useDemoCartHydrated();
  const stored = useDemoCartStore((s) => s.fulfillment);
  const setFulfillment = useDemoCartStore((s) => s.setFulfillment);
  // Show the default until the persisted choice is back, so the first client
  // render matches the server's — see useDemoCartHydrated.
  const fulfillment = hydrated ? stored : 'DELIVERY';

  return (
    <div
      role="radiogroup"
      aria-label="Cum vrei să primești comanda"
      className="mt-4 grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5"
    >
      {OPTIONS.map(({ value, label, hint, Icon }) => {
        const active = fulfillment === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setFulfillment(value)}
            // Label and hint are stacked, not inline: side by side at 390px
            // "Ridic personal · gratuit" wrapped mid-phrase and the switch
            // looked broken.
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hir-brand)] ${
              active
                ? 'bg-[var(--hir-brand)] text-white'
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
            <span className={`text-[11px] ${active ? 'text-white/80' : 'text-zinc-400'}`}>
              {hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
