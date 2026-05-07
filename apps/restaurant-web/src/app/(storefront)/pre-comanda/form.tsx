'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, ShoppingBag } from 'lucide-react';
import { useCart } from '@/lib/cart/provider';
import { formatRon } from '@/lib/format';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Earliest selectable slot, rounded UP to the next half-hour for nicer UX.
 * Returns local-date + local-time strings ready for <input type="date|time">.
 */
function defaultSlot(minAdvanceHours: number): { date: string; time: string } {
  const t = new Date(Date.now() + minAdvanceHours * 3_600_000 + 30 * 60_000);
  const m = t.getMinutes();
  const next = m < 30 ? 30 : 60;
  t.setMinutes(next - m, 0, 0);
  return {
    date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`,
    time: `${pad(t.getHours())}:${pad(t.getMinutes())}`,
  };
}

function maxDateString(maxAdvanceDays: number): string {
  const t = new Date(Date.now() + maxAdvanceDays * 86_400_000);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function buildIsoLocal(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function PreOrderForm({
  tenantId: _tenantId,
  minAdvanceHours,
  maxAdvanceDays,
  minSubtotalRon,
}: {
  tenantId: string;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  minSubtotalRon: number;
}) {
  const useCartStore = useCart();
  const cartItems = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clear);

  // Hydration guard: zustand-persist rehydrates client-side, so server-render
  // sees an empty store. Without this, SSR + first-paint would show the
  // "coșul este gol" panel even when the user has items in localStorage.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const router = useRouter();
  const [submitting, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const initial = useMemo(() => defaultSlot(minAdvanceHours), [minAdvanceHours]);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [notes, setNotes] = useState('');

  const minDate = initial.date;
  const maxDate = useMemo(() => maxDateString(maxAdvanceDays), [maxAdvanceDays]);

  const subtotalRon = useMemo(
    () =>
      cartItems.reduce((sum, item) => {
        const modifiers = item.modifiers.reduce((s, m) => s + m.price_delta_ron, 0);
        return sum + (item.unitPriceRon + modifiers) * item.qty;
      }, 0),
    [cartItems],
  );

  if (hydrated && cartItems.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center">
        <ShoppingBag className="mx-auto h-8 w-8 text-zinc-400" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold text-zinc-900">Coșul este gol</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Adăugați mai întâi produsele dorite din meniu, apoi reveniți pentru a
          alege data și ora.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Către meniu
        </Link>
      </div>
    );
  }

  const belowMin = minSubtotalRon > 0 && subtotalRon < minSubtotalRon;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const isoLocal = buildIsoLocal(date, time);
    if (!isoLocal) {
      setError('Data sau ora invalidă.');
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError('Vă rugăm completați numele, prenumele și telefonul.');
      return;
    }

    start(async () => {
      const payload = {
        items: cartItems.map((it) => ({
          itemId: it.itemId,
          quantity: it.qty,
          modifierIds: it.modifiers.map((m) => m.id),
        })),
        fulfillment: 'PICKUP' as const,
        customer: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
        },
        notes: notes.trim() || undefined,
        scheduledFor: isoLocal,
      };

      try {
        const res = await fetch('/api/checkout/pre-order', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
            reason?: string;
          };
          setError(translateError(json.error, json.reason));
          return;
        }
        const json = (await res.json()) as { trackToken?: string };
        clearCart();
        if (json.trackToken) {
          router.push(`/track/${json.trackToken}`);
        } else {
          router.push('/');
        }
      } catch (_err) {
        setError('A apărut o eroare. Vă rugăm încercați din nou.');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Coșul dvs.</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {cartItems.map((it) => (
            <li
              key={it.lineId}
              className="flex items-center justify-between gap-2 text-zinc-700"
            >
              <span className="truncate">
                <span className="font-medium text-zinc-900">{it.qty}× </span>
                {it.name}
              </span>
              <span className="tabular-nums text-zinc-600">
                {formatRon((it.unitPriceRon +
                  it.modifiers.reduce((s, m) => s + m.price_delta_ron, 0)) *
                  it.qty)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 text-sm font-medium text-zinc-900">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatRon(subtotalRon)}</span>
        </div>
        {belowMin && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            Pentru pre-comandă, subtotalul minim este{' '}
            {formatRon(minSubtotalRon)}.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Când doriți comanda?</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Cu cel puțin {minAdvanceHours} {minAdvanceHours === 1 ? 'oră' : 'ore'}{' '}
          în avans, până la {maxAdvanceDays}{' '}
          {maxAdvanceDays === 1 ? 'zi' : 'zile'}.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Data
            <input
              type="date"
              required
              min={minDate}
              max={maxDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Ora
            <input
              type="time"
              required
              step={900}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Datele dvs. de contact</h2>
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
              Prenume
              <input
                type="text"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
              Nume
              <input
                type="text"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Telefon
            <input
              type="tel"
              required
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Email <span className="font-normal text-zinc-400">(opțional)</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Mențiuni <span className="font-normal text-zinc-400">(opțional)</span>
            <textarea
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: număr de invitați, ocazie, preferințe."
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
          </label>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || belowMin}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {submitting ? (
          'Se trimite...'
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Trimite pre-comanda
          </>
        )}
      </button>

      <p className="text-center text-xs text-zinc-400">
        Restaurantul vă va contacta pentru confirmare și plată.
      </p>
    </form>
  );
}

function translateError(code?: string, reason?: string): string {
  if (code === 'pre_orders_disabled')
    return 'Pre-comenzile nu sunt active pentru acest restaurant.';
  if (code === 'invalid_schedule') {
    if (reason === 'too_soon')
      return 'Data aleasă este prea aproape. Alegeți un interval mai larg.';
    if (reason === 'too_far')
      return 'Data aleasă este prea departe. Alegeți o dată mai apropiată.';
    return 'Data aleasă nu este validă.';
  }
  if (code === 'below_min_subtotal')
    return 'Subtotalul este sub minimul cerut pentru pre-comandă.';
  if (code === 'rate_limited')
    return 'Prea multe încercări. Vă rugăm așteptați un minut.';
  if (code === 'invalid_request')
    return 'Datele formularului sunt incomplete sau invalide.';
  return 'A apărut o eroare. Vă rugăm încercați din nou.';
}
