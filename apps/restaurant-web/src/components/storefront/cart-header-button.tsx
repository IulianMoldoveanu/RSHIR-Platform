'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/lib/cart/provider';
import { t, type Locale } from '@/lib/i18n';

/** Event `CartPill` (cart-drawer.tsx) listens for to open its sheet. A window
 *  event rather than shared state because the two components are not in the
 *  same subtree — the header is rendered by the page, the pill by the layout —
 *  and this file already uses the same idiom for `hir:applied-promo-changed`. */
export const OPEN_CART_EVENT = 'hir:open-cart';

// Cart button for the header's top-right cluster, next to the language flag
// and the account link.
//
// Added 2026-08-03. The storefront already had a cart — the bottom pill — and
// that stays: it's the dominant mobile pattern and it carries the running
// total. What it didn't have was a cart that is visible *before* you add
// anything, which is what Iulian asked for after Boost Eat ("sa se vada cosul
// de cumparaturi undeva in dreapta ecranului"). A returning customer with a
// restored cart also had nothing to look at above the fold.
//
// It opens the same sheet the pill opens. There is exactly one cart UI.
export function CartHeaderButton({ locale }: { locale: Locale }) {
  const useCartStore = useCart();
  const count = useCartStore((s) => s.getCount());

  // The cart is restored from localStorage, so the server renders 0 and the
  // client's first pass may not. Rendering the badge only after mount keeps
  // the two in agreement — same reason CartPill gates on `hydrated`.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CART_EVENT))}
      aria-label={t(locale, 'cart.view_cart')}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <ShoppingBag className="h-4 w-4" aria-hidden />
      {hydrated && count > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--hir-brand,#7c3aed)] px-1 text-[10px] font-bold leading-none tabular-nums text-white ring-2 ring-white"
          aria-hidden
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
