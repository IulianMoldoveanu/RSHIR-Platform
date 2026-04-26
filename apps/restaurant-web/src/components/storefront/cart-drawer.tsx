'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Flame, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@hir/ui';
import { useCart } from '@/lib/cart/provider';
import { lineTotalRon } from '@/lib/cart/store';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import { previewDiscount, readStoredPromo, type StoredPromo } from '@/lib/cart/promo';
import { ReorderRail } from './reorder-rail';
import type { MenuItemWithModifiers } from '@/lib/menu';

export function CartPill({
  closedReason = null,
  locale,
  minOrderRon = 0,
  freeDeliveryThresholdRon = 0,
  upsellItems = [],
}: {
  closedReason?: string | null;
  locale: Locale;
  minOrderRon?: number;
  freeDeliveryThresholdRon?: number;
  /** Top-popular items for cart upsell (B2). Filtered against current cart. */
  upsellItems?: MenuItemWithModifiers[];
}) {
  const useCartStore = useCart();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const items = useCartStore((s) => s.items);
  const getCount = useCartStore((s) => s.getCount);
  const getSubtotal = useCartStore((s) => s.getSubtotal);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);

  const [appliedPromo, setAppliedPromo] = useState<StoredPromo | null>(null);

  useEffect(() => {
    setHydrated(true);
    setAppliedPromo(readStoredPromo());
    const refresh = () => setAppliedPromo(readStoredPromo());
    window.addEventListener('hir:applied-promo-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('hir:applied-promo-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // B2: filter upsell candidates to items not already in the cart. The rail
  // is hidden if every popular item is already there (well-rounded order).
  const cartItemIds = useMemo(() => new Set(items.map((i) => i.itemId)), [items]);
  const filteredUpsell = useMemo(
    () => upsellItems.filter((it) => !cartItemIds.has(it.id)),
    [upsellItems, cartItemIds],
  );

  const count = hydrated ? getCount() : 0;
  const subtotal = hydrated ? getSubtotal() : 0;
  // Drawer doesn't know the delivery fee yet — show the discount only when
  // it doesn't depend on it (PERCENT/FIXED). FREE_DELIVERY is hidden until
  // the user gets a quote on the checkout page.
  const previewDiscountRon =
    appliedPromo && appliedPromo.kind !== 'FREE_DELIVERY'
      ? previewDiscount(appliedPromo, subtotal, 0)
      : 0;

  if (count === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed inset-x-4 bottom-4 z-40 mx-auto flex h-14 max-w-md items-center justify-between rounded-full bg-[var(--hir-brand)] px-5 text-white shadow-xl transition-transform hover:scale-[1.01]"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold tabular-nums text-zinc-900">
            {count}
          </span>
          <span className="text-sm font-medium">
            {t(locale, 'cart.products_count_template', { count: String(count) })}
          </span>
        </span>
        <span className="text-sm font-semibold tabular-nums">{formatRon(subtotal, locale)}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[85vh] sm:border">
          <SheetHeader>
            <SheetTitle>{t(locale, 'cart.title')}</SheetTitle>
            <p className="text-xs text-zinc-500">{t(locale, 'cart.products_count_template', { count })}</p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-zinc-500">
                <ShoppingBag className="h-10 w-10 text-zinc-300" />
                <p className="text-sm font-semibold text-zinc-800">{t(locale, 'cart.empty')}</p>
                <p className="max-w-xs text-xs text-zinc-500">{t(locale, 'cart.empty_hint')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((it) => {
                  const total = lineTotalRon(it);
                  const modText = it.modifiers.map((m) => m.name).join(', ');
                  return (
                    <li key={it.lineId} className="flex gap-3 py-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                        {it.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.imageUrl}
                            alt={it.name}
                            width={64}
                            height={64}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="line-clamp-1 text-sm font-medium text-zinc-900">
                          {it.name}
                        </span>
                        {modText ? (
                          <span className="line-clamp-1 text-xs text-zinc-500">{modText}</span>
                        ) : null}
                        <div className="mt-auto flex items-center justify-between pt-1.5">
                          <div className="flex items-center gap-1 rounded-full bg-zinc-100 p-0.5">
                            <button
                              type="button"
                              onClick={() => updateQty(it.lineId, it.qty - 1)}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm"
                              aria-label={t(locale, 'cart.decrease')}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center text-xs font-semibold tabular-nums">
                              {it.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(it.lineId, it.qty + 1)}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm"
                              aria-label={t(locale, 'cart.increase')}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-zinc-900">
                            {formatRon(total, locale)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(it.lineId)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                        aria-label={t(locale, 'cart.remove')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {items.length > 0 && filteredUpsell.length > 0 && (
              <ReorderRail
                items={filteredUpsell}
                locale={locale}
                title={t(locale, 'cart.upsell_title')}
                icon={Flame}
                className="pt-4"
              />
            )}
          </div>

          {items.length > 0 ? (
            <div className="border-t border-zinc-100 bg-white">
              {/* Threshold nudges (B1 + B6 from conversion research). Both
                  optional per tenant — render only when configured > 0.
                  Free-delivery progress bar comes first because it's
                  motivational; min-order hard-block disables checkout. */}
              {(() => {
                const belowMin = minOrderRon > 0 && subtotal < minOrderRon;
                const remainingToFree = Math.max(0, freeDeliveryThresholdRon - subtotal);
                const showFreeBar = freeDeliveryThresholdRon > 0;
                const reachedFree = showFreeBar && remainingToFree === 0;
                const pct = showFreeBar
                  ? Math.min(100, Math.round((subtotal / freeDeliveryThresholdRon) * 100))
                  : 0;
                return (
                  <>
                    {showFreeBar && (
                      <div className="px-5 pt-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className={reachedFree ? 'font-medium text-emerald-700' : 'text-zinc-600'}>
                            {reachedFree
                              ? t(locale, 'cart.free_delivery_reached')
                              : t(locale, 'cart.free_delivery_progress_template', {
                                  amount: formatRon(remainingToFree, locale),
                                })}
                          </span>
                          <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                            {formatRon(freeDeliveryThresholdRon, locale)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              reachedFree ? 'bg-emerald-500' : 'bg-[var(--hir-brand)]'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {belowMin && (
                      <div className="mx-5 mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <span>
                          {t(locale, 'cart.below_min_order_template', {
                            remaining: formatRon(minOrderRon - subtotal, locale),
                            min: formatRon(minOrderRon, locale),
                          })}
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="flex items-center justify-between px-5 pt-4 text-sm">
                <span className="text-zinc-600">{t(locale, 'cart.subtotal')}</span>
                <span className="font-semibold tabular-nums text-zinc-900">
                  {formatRon(subtotal, locale)}
                </span>
              </div>
              {appliedPromo && previewDiscountRon > 0 && (
                <div className="flex items-center justify-between px-5 pt-1 text-sm">
                  <span className="text-emerald-700">
                    {t(locale, 'promo.cart_discount_label')} ({appliedPromo.code})
                  </span>
                  <span className="font-semibold tabular-nums text-emerald-700">
                    − {formatRon(previewDiscountRon, locale)}
                  </span>
                </div>
              )}
              <SheetFooter className="border-t-0 pt-2">
                <div className="flex w-full flex-col gap-2">
                  {closedReason ? (
                    <button
                      type="button"
                      disabled
                      title={closedReason}
                      aria-disabled="true"
                      className="flex w-full cursor-not-allowed items-center justify-center rounded-full bg-zinc-300 px-5 py-3.5 text-sm font-semibold text-zinc-600"
                    >
                      {t(locale, 'cart.closed_unavailable')}
                    </button>
                  ) : minOrderRon > 0 && subtotal < minOrderRon ? (
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className="flex w-full cursor-not-allowed items-center justify-center rounded-full bg-zinc-300 px-5 py-3.5 text-sm font-semibold text-zinc-600"
                    >
                      {t(locale, 'cart.below_min_cta_template', {
                        remaining: formatRon(minOrderRon - subtotal, locale),
                      })}
                    </button>
                  ) : (
                    <Link
                      href="/checkout"
                      onClick={() => {
                        try {
                          const snapshot = {
                            items: items.map((it) => ({
                              itemId: it.itemId,
                              name: it.name,
                              priceRon: it.unitPriceRon,
                              quantity: it.qty,
                              modifiers: it.modifiers.map((m) => ({
                                id: m.id,
                                name: m.name,
                                priceDeltaRon: m.price_delta_ron,
                              })),
                              notes: it.notes,
                            })),
                          };
                          window.sessionStorage.setItem('hir.cart', JSON.stringify(snapshot));
                        } catch {
                          // sessionStorage might be disabled (private mode);
                          // checkout will render its empty-cart state and
                          // route the user back here, which is recoverable.
                        }
                      }}
                      className="flex w-full items-center justify-center rounded-full bg-[var(--hir-brand)] px-5 py-3.5 text-sm font-semibold text-white hover:opacity-90"
                    >
                      {t(locale, 'cart.continue_checkout')}
                    </Link>
                  )}
                  {closedReason && (
                    <p className="text-center text-xs text-zinc-500">{closedReason}</p>
                  )}
                  {/* §3 P2: WhatsApp share moved out of the cart footer —
                      it competed with the primary checkout CTA and lowered
                      conversion. Tenant-header still has its own WhatsApp
                      ordering button for customers who prefer that path. */}
                </div>
              </SheetFooter>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
