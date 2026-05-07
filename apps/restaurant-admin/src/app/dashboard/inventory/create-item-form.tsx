'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Supplier } from '@/lib/inventory';
import { createItemAction } from './actions';

const UNIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'l', label: 'l' },
  { value: 'ml', label: 'ml' },
  { value: 'buc', label: 'bucăți' },
  { value: 'portie', label: 'porție' },
];

export function CreateItemForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const res = await createItemAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      form.reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700 sm:col-span-2">
        Nume ingredient
        <input
          name="name"
          required
          maxLength={120}
          placeholder="ex. făină 000"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
        Unitate
        <select
          name="unit"
          defaultValue="kg"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
        Stoc curent
        <input
          name="current_stock"
          type="number"
          step="0.001"
          min="0"
          defaultValue="0"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
        Prag reaprovizionare
        <input
          name="reorder_threshold"
          type="number"
          step="0.001"
          min="0"
          defaultValue="0"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
        Cantitate de comandat
        <input
          name="reorder_quantity"
          type="number"
          step="0.001"
          min="0"
          defaultValue="0"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </label>

      {suppliers.length > 0 ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700 sm:col-span-2">
          Furnizor (opțional)
          <select
            name="supplier_id"
            defaultValue=""
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">— niciunul —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:col-span-2">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Se adaugă…' : 'Adaugă ingredient'}
        </button>
      </div>
    </form>
  );
}
