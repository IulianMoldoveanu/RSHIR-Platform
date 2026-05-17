'use client';

import { useState, useTransition, useMemo } from 'react';
import { Minus, Plus, Search, X } from 'lucide-react';
import { manualCreateOrder } from '../actions';
import type { ManualMenuItem } from './page';

type CartEntry = { menuItemId: string; name: string; priceRon: number; qty: number };

function formatRon(n: number): string {
  return `${n.toFixed(2)} RON`;
}

export function ManualEntryClient({
  menu,
  tenantId,
}: {
  menu: ManualMenuItem[];
  tenantId: string;
}) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [fulfillment, setFulfillment] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'CARD'>('COD');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menu;
    return menu.filter((it) => it.name.toLowerCase().includes(q));
  }, [menu, search]);

  const subtotal = cart.reduce((s, e) => s + e.priceRon * e.qty, 0);

  function addItem(item: ManualMenuItem) {
    setCart((prev) => {
      const existing = prev.find((e) => e.menuItemId === item.id);
      if (existing) {
        return prev.map((e) =>
          e.menuItemId === item.id ? { ...e, qty: e.qty + 1 } : e,
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, priceRon: item.price_ron, qty: 1 }];
    });
  }

  function changeQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((e) => (e.menuItemId === menuItemId ? { ...e, qty: e.qty + delta } : e))
        .filter((e) => e.qty > 0),
    );
  }

  function removeItem(menuItemId: string) {
    setCart((prev) => prev.filter((e) => e.menuItemId !== menuItemId));
  }

  const isDelivery = fulfillment === 'DELIVERY';
  const canSubmit =
    customerName.trim().length > 0 &&
    customerPhone.trim().length >= 6 &&
    cart.length > 0 &&
    (!isDelivery || dropoffAddress.trim().length >= 3) &&
    !isPending;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('tenantId', tenantId);
    fd.set('customerName', customerName);
    fd.set('customerPhone', customerPhone);
    fd.set('customerEmail', customerEmail);
    fd.set('fulfillmentType', fulfillment);
    fd.set('dropoffAddress', dropoffAddress);
    fd.set('paymentMethod', paymentMethod);
    fd.set('notes', notes);
    fd.set(
      'itemsJson',
      JSON.stringify(cart.map((e) => ({ menuItemId: e.menuItemId, qty: e.qty }))),
    );
    startTransition(async () => {
      try {
        await manualCreateOrder(fd);
      } catch (err) {
        setError((err as Error).message ?? 'Eroare necunoscută.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Left column: customer + fulfillment + products */}
      <div className="flex flex-1 flex-col gap-4">
        {/* 1. Client */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Date client</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="customerName" className="mb-1 block text-xs font-medium text-zinc-700">
                Nume <span aria-hidden>*</span>
              </label>
              <input
                id="customerName"
                type="text"
                autoComplete="off"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ion Popescu"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label htmlFor="customerPhone" className="mb-1 block text-xs font-medium text-zinc-700">
                Telefon <span aria-hidden>*</span>
              </label>
              <input
                id="customerPhone"
                type="tel"
                autoComplete="off"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="0712 345 678"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label htmlFor="customerEmail" className="mb-1 block text-xs font-medium text-zinc-700">
                Email <span className="text-zinc-400">(opțional)</span>
              </label>
              <input
                id="customerEmail"
                type="email"
                autoComplete="off"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="client@email.com"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>
        </section>

        {/* 2. Fulfillment type */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Tip comandă</h2>
          <div className="flex gap-3">
            {(['DELIVERY', 'PICKUP'] as const).map((type) => (
              <label
                key={type}
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  fulfillment === type
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                <input
                  type="radio"
                  name="fulfillmentType"
                  value={type}
                  checked={fulfillment === type}
                  onChange={() => setFulfillment(type)}
                  className="sr-only"
                />
                {type === 'DELIVERY' ? 'Livrare' : 'Ridicare'}
              </label>
            ))}
          </div>

          {isDelivery && (
            <div className="mt-3">
              <label htmlFor="dropoffAddress" className="mb-1 block text-xs font-medium text-zinc-700">
                Adresă livrare <span aria-hidden>*</span>
              </label>
              <textarea
                id="dropoffAddress"
                rows={2}
                required={isDelivery}
                value={dropoffAddress}
                onChange={(e) => setDropoffAddress(e.target.value)}
                placeholder="Str. Exemplu nr. 10, ap. 3, Sector 1"
                className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          )}
        </section>

        {/* 3. Products */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Produse</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
            <input
              type="text"
              aria-label="Caută produs"
              placeholder="Caută produs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-zinc-300 py-2 pl-8 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" role="list">
            {filtered.length === 0 && (
              <li className="py-4 text-center text-sm text-zinc-400">Niciun produs găsit.</li>
            )}
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => addItem(item)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                >
                  <span className="min-w-0 flex-1 truncate text-zinc-900">{item.name}</span>
                  <span className="ml-3 flex-none text-xs font-medium text-zinc-500">
                    {formatRon(item.price_ron)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Right column: cart + notes + payment + submit */}
      <div className="flex w-full flex-col gap-4 lg:w-80 lg:flex-none">
        {/* Cart */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            Coș{' '}
            {cart.length > 0 && (
              <span className="text-zinc-400">({cart.length} {cart.length === 1 ? 'produs' : 'produse'})</span>
            )}
          </h2>
          {cart.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">
              Niciun produs adăugat.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" role="list">
              {cart.map((entry) => (
                <li key={entry.menuItemId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">
                    {entry.name}
                  </span>
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Scade cantitate ${entry.name}`}
                      onClick={() => changeQty(entry.menuItemId, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                    >
                      <Minus className="h-3 w-3" aria-hidden />
                    </button>
                    <span className="w-5 text-center text-sm tabular-nums text-zinc-900">
                      {entry.qty}
                    </span>
                    <button
                      type="button"
                      aria-label={`Crește cantitate ${entry.name}`}
                      onClick={() => changeQty(entry.menuItemId, 1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                    >
                      <Plus className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                  <span className="w-20 flex-none text-right text-xs tabular-nums text-zinc-500">
                    {formatRon(entry.priceRon * entry.qty)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Elimină ${entry.name}`}
                    onClick={() => removeItem(entry.menuItemId)}
                    className="flex h-6 w-6 flex-none items-center justify-center rounded text-zinc-400 hover:text-rose-500"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cart.length > 0 && (
            <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3">
              <span className="text-sm font-medium text-zinc-900">Subtotal</span>
              <span className="text-sm font-semibold tabular-nums text-zinc-900">
                {formatRon(subtotal)}
              </span>
            </div>
          )}
        </section>

        {/* Notes */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
          <label htmlFor="notes" className="mb-1 block text-sm font-semibold text-zinc-900">
            Note <span className="font-normal text-zinc-400">(opțional)</span>
          </label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Fără ceapă, etaj 2..."
            className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </section>

        {/* Payment */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Plată</h2>
          <div className="flex gap-3">
            {(['COD', 'CARD'] as const).map((method) => (
              <label
                key={method}
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  paymentMethod === method
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method}
                  checked={paymentMethod === method}
                  onChange={() => setPaymentMethod(method)}
                  className="sr-only"
                />
                {method === 'COD' ? 'Numerar' : 'Card'}
              </label>
            ))}
          </div>
        </section>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Se creează...' : 'Creează comanda'}
        </button>
      </div>
    </form>
  );
}
