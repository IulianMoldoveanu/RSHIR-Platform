'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useDemoCartStore, demoLineTotalRon } from '@/lib/demo/demo-cart-store';

// Fully fake checkout — no `/api/checkout/intent`, no Netopia/Stripe, no
// real order row is ever written. Submitting just clears the demo cart and
// routes to a simulated confirmation/tracking page. Kept as its own route,
// deliberately not reusing `CheckoutClient.tsx`, so this can never
// accidentally touch a real payment or order.
export default function DemoCheckoutPage() {
  const router = useRouter();
  const items = useDemoCartStore((s) => s.items);
  const subtotal = useDemoCartStore((s) => s.getSubtotal());
  const clear = useDemoCartStore((s) => s.clear);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // Simulated network delay so the flow feels like a real checkout.
    setTimeout(() => {
      clear();
      router.push('/demo-storefront/confirmare');
    }, 700);
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-zinc-500">Coșul demo este gol.</p>
        <Link href="/demo-storefront" className="mt-3 inline-block text-sm font-semibold text-[var(--hir-brand)]">
          Înapoi la meniu
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link href="/demo-storefront" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Înapoi la meniu
      </Link>

      <h1 className="mb-4 text-lg font-bold text-zinc-900">Finalizare comandă (demo)</h1>

      <div className="mb-4 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3">
        {items.map((item) => (
          <div key={item.lineId} className="flex justify-between text-sm">
            <span className="text-zinc-700">
              {item.qty}× {item.name}
            </span>
            <span className="font-medium text-zinc-900">{demoLineTotalRon(item).toFixed(2)} lei</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-sm font-bold">
          <span>Total</span>
          <span>{subtotal.toFixed(2)} lei</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nume"
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand)]"
        />
        <input
          type="text"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Adresă de livrare"
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand)]"
        />
        <p className="text-[11px] text-zinc-400">
          Aceasta este o comandă simulată — nu se procesează nicio plată și nu se trimite nimic unui restaurant real.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-[var(--hir-brand)] text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Se trimite...' : `Plasează comanda demo · ${subtotal.toFixed(2)} lei`}
        </button>
      </form>
    </div>
  );
}
