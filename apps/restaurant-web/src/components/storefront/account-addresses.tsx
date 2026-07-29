'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Plus, Star, Trash2 } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';

export type SavedAddress = {
  id: string;
  line1: string;
  line2: string | null;
  city: string;
  postal_code: string | null;
  label: string | null;
  is_default: boolean;
};

// Saved delivery addresses — the "detalii de livrare prestabilite" ask.
// customer_addresses already existed in the schema but had no write path
// or UI before this. Checkout prefill (reading the default address here)
// is a separate, later piece — this component only manages the list.
export function AccountAddresses({ locale, initial }: { locale: Locale; initial: SavedAddress[] }) {
  const router = useRouter();
  const [addresses, setAddresses] = useState<SavedAddress[]>(initial);
  const [adding, setAdding] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');

  function resetForm() {
    setLabel('');
    setLine1('');
    setLine2('');
    setCity('');
    setAdding(false);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/account/addresses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label,
          line1,
          line2,
          city,
          isDefault: addresses.length === 0,
        }),
      });
      if (!res.ok) {
        setError(t(locale, 'account.auth_err_generic'));
        return;
      }
      const data = (await res.json()) as { address: SavedAddress };
      setAddresses((prev) =>
        (data.address.is_default ? prev.map((a) => ({ ...a, is_default: false })) : prev).concat(data.address),
      );
      resetForm();
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  async function handleSetDefault(id: string) {
    setWorking(true);
    try {
      const res = await fetch(`/api/account/addresses/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      if (res.ok) {
        setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
        router.refresh();
      }
    } finally {
      setWorking(false);
    }
  }

  async function handleDelete(id: string) {
    setWorking(true);
    try {
      const res = await fetch(`/api/account/addresses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAddresses((prev) => prev.filter((a) => a.id !== id));
        router.refresh();
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <MapPin className="h-4 w-4" aria-hidden />
        {t(locale, 'account.addresses_title')}
      </div>

      {addresses.length === 0 && !adding && (
        <p className="mb-3 text-xs text-zinc-500">{t(locale, 'account.addresses_empty')}</p>
      )}

      <ul className="mb-3 flex flex-col gap-2">
        {addresses.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg border border-zinc-200 p-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium text-zinc-900">{a.label || a.line1}</p>
                {a.is_default && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                    <Star className="h-2.5 w-2.5 fill-purple-700" aria-hidden />
                    {t(locale, 'account.addresses_default_badge')}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ''}, {a.city}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!a.is_default && (
                <button
                  type="button"
                  onClick={() => handleSetDefault(a.id)}
                  disabled={working}
                  className="text-xs font-medium text-purple-700 hover:underline disabled:opacity-50"
                >
                  {t(locale, 'account.addresses_set_default')}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                disabled={working}
                aria-label={t(locale, 'account.addresses_delete')}
                className="text-zinc-400 hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {adding ? (
        <form onSubmit={handleAdd} className="flex flex-col gap-2.5 rounded-lg border border-zinc-200 p-3">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t(locale, 'account.addresses_label_placeholder')}
            className="h-9 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
          />
          <input
            type="text"
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            placeholder={t(locale, 'account.addresses_line1_placeholder')}
            required
            className="h-9 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
          />
          <input
            type="text"
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
            placeholder={t(locale, 'account.addresses_line2_placeholder')}
            className="h-9 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
          />
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t(locale, 'account.addresses_city_placeholder')}
            required
            className="h-9 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={working}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {t(locale, 'account.addresses_add_cta')}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700"
            >
              {t(locale, 'account.addresses_cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-700 hover:underline"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t(locale, 'account.addresses_add')}
        </button>
      )}
    </section>
  );
}
