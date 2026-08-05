'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import {
  demoLineTotalRon,
  useDemoCartHydrated,
  useDemoCartStore,
} from '@/lib/demo/demo-cart-store';

// Cart button for the demo header's top-right cluster.
//
// Mirrors `components/storefront/cart-header-button.tsx` exactly — same 36px
// white pill, same brand badge, same position beside the language flag — but
// drives the isolated demo cart and opens its own panel. It cannot reuse the
// real `CartPill`: that one is bound to `useCart()` (a real tenant's cart) and
// posting to `/api/cart/upsell`, and the demo must never touch either.
//
// The panel deliberately copies the real cart sheet's shape: full-width sheet
// rising from the bottom on a phone, centred card on a desktop. A prospect
// comparing the demo against the product should not find a different cart.
export function DemoCartButton() {
  const [open, setOpen] = useState(false);
  const hydrated = useDemoCartHydrated();
  const items = useDemoCartStore((s) => s.items);
  const count = useDemoCartStore((s) => s.getCount());
  const subtotal = useDemoCartStore((s) => s.getSubtotal());
  const deliveryFee = useDemoCartStore((s) => s.getDeliveryFee());
  const total = useDemoCartStore((s) => s.getTotal());
  const fulfillment = useDemoCartStore((s) => s.fulfillment);
  const updateQty = useDemoCartStore((s) => s.updateQty);
  const removeItem = useDemoCartStore((s) => s.removeItem);
  const isPickup = fulfillment === 'PICKUP';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Vezi coșul"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {/* Only after rehydration — the server renders an empty cart and a
            restored one would otherwise mismatch on the first client pass.
            See useDemoCartHydrated. */}
        {hydrated && count > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--hir-brand)] px-1 text-[10px] font-bold leading-none tabular-nums text-white ring-2 ring-white"
            aria-hidden
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Închide"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-zinc-900/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-cart-title"
            className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
              <h2 id="demo-cart-title" className="text-base font-bold text-zinc-900">
                Coșul tău
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-1 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" aria-hidden />
                <span className="sr-only">Închide</span>
              </button>
            </header>

            {items.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-zinc-900">Coșul e gol.</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Adaugă produse din meniu pentru a continua.
                </p>
              </div>
            ) : (
              <>
                <ul className="flex-1 overflow-y-auto px-5 py-3">
                  {items.map((item) => (
                    <li
                      key={item.lineId}
                      className="flex items-center gap-3 border-b border-zinc-100 py-3 last:border-0"
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-12 w-12 shrink-0 rounded-lg bg-zinc-100 object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-zinc-900">{item.name}</p>
                        <p className="text-xs text-zinc-500">
                          {demoLineTotalRon(item).toFixed(2)} lei
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateQty(item.lineId, item.qty - 1)}
                          aria-label="Scade"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold tabular-nums text-zinc-900">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.lineId, item.qty + 1)}
                          aria-label="Crește"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.lineId)}
                          aria-label={`Șterge ${item.name}`}
                          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <footer className="border-t border-zinc-100 px-5 py-4">
                  <div className="flex justify-between text-sm text-zinc-600">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{subtotal.toFixed(2)} lei</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm text-zinc-600">
                    <span>{isPickup ? 'Ridicare de la restaurant' : 'Livrare'}</span>
                    <span className="tabular-nums">
                      {isPickup ? 'gratuit' : `${deliveryFee.toFixed(2)} lei`}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-sm font-bold text-zinc-900">
                    <span>Total</span>
                    <span className="tabular-nums">{total.toFixed(2)} lei</span>
                  </div>
                  <Link
                    href="/demo-storefront/checkout"
                    onClick={() => setOpen(false)}
                    className="mt-3 flex h-11 items-center justify-center rounded-xl bg-[var(--hir-brand)] text-sm font-semibold text-white"
                  >
                    Continuă către checkout
                  </Link>
                </footer>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
