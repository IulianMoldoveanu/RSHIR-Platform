'use client';

import { useEffect, useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { useCart } from '@/lib/cart/provider';
import { t, type Locale } from '@/lib/i18n';

/**
 * Mobile-only sticky "Vezi meniul" CTA shown when the cart is empty and the
 * user has scrolled past the hero (Feature S5). Disappears when items are
 * added — at that point CartPill (cart-drawer.tsx) takes over the same slot
 * with the primary "Vezi coșul" CTA. Hidden on desktop (md:hidden).
 *
 * Tapping scrolls smoothly to the menu list anchor injected by MenuList
 * (#cat-<id>) — we just target the first such element if present, falling
 * back to a generic main scroll.
 */
const SCROLL_REVEAL_PX = 200;

export function EmptyCartCta({ locale }: { locale: Locale }) {
  const useCartStore = useCart();
  const [hydrated, setHydrated] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const count = useCartStore((s) => (hydrated ? s.getCount() : 0));

  useEffect(() => {
    setHydrated(true);
    const onScroll = () => setScrolled(window.scrollY > SCROLL_REVEAL_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!hydrated || count > 0 || !scrolled) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const firstCat = document.querySelector<HTMLElement>('[id^="cat-"]');
        if (firstCat) {
          firstCat.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }}
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex h-14 max-w-md items-center justify-center gap-2 rounded-full bg-[var(--hir-brand,#7c3aed)] px-5 text-sm font-semibold text-white shadow-xl md:hidden"
    >
      <UtensilsCrossed className="h-4 w-4" aria-hidden />
      <span>{t(locale, 'storefront_cta.view_menu')}</span>
    </button>
  );
}
