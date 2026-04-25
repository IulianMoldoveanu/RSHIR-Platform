'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@hir/ui';
import { useCart } from '@/lib/cart/provider';
import { lineTotalRon } from '@/lib/cart/store';
import { formatRon } from '@/lib/format';
import { WhatsAppShareButton } from './share-button';

export function CartPill({
  siteUrl,
  closedReason = null,
}: {
  siteUrl: string;
  closedReason?: string | null;
}) {
  const useCartStore = useCart();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const items = useCartStore((s) => s.items);
  const getCount = useCartStore((s) => s.getCount);
  const getSubtotal = useCartStore((s) => s.getSubtotal);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);

  useEffect(() => setHydrated(true), []);

  const count = hydrated ? getCount() : 0;
  const subtotal = hydrated ? getSubtotal() : 0;

  if (count === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed inset-x-4 bottom-4 z-40 mx-auto flex h-14 max-w-md items-center justify-between rounded-full bg-zinc-900 px-5 text-white shadow-xl transition-transform hover:scale-[1.01]"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold tabular-nums text-zinc-900">
            {count}
          </span>
          <span className="text-sm font-medium">Vezi coșul</span>
        </span>
        <span className="text-sm font-semibold tabular-nums">{formatRon(subtotal)}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[85vh] sm:border">
          <SheetHeader>
            <SheetTitle>Coșul tău</SheetTitle>
            <p className="text-xs text-zinc-500">{count} produse</p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-zinc-500">
                <ShoppingBag className="h-8 w-8" />
                <p className="text-sm">Coșul e gol.</p>
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
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm"
                              aria-label="Scade"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center text-xs font-semibold tabular-nums">
                              {it.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(it.lineId, it.qty + 1)}
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm"
                              aria-label="Crește"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-zinc-900">
                            {formatRon(total)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(it.lineId)}
                        className="self-start text-zinc-400 hover:text-red-600"
                        aria-label="Șterge"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {items.length > 0 ? (
            <div className="border-t border-zinc-100 bg-white">
              <div className="flex items-center justify-between px-5 pt-4 text-sm">
                <span className="text-zinc-600">Subtotal</span>
                <span className="font-semibold tabular-nums text-zinc-900">
                  {formatRon(subtotal)}
                </span>
              </div>
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
                      Închis — checkout indisponibil
                    </button>
                  ) : (
                    <Link
                      href="/checkout"
                      className="flex w-full items-center justify-center rounded-full bg-zinc-900 px-5 py-3.5 text-sm font-semibold text-white hover:bg-zinc-800"
                    >
                      Continuă către checkout
                    </Link>
                  )}
                  {closedReason && (
                    <p className="text-center text-xs text-zinc-500">{closedReason}</p>
                  )}
                  <WhatsAppShareButton
                    text="Uite ce am pus în coș de la"
                    url={siteUrl}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-600 px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                  />
                </div>
              </SheetFooter>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
