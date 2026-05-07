'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { linkRecipeAction } from '../actions';

export function LinkRecipeForm({
  inventoryItemId,
  inventoryUnit,
  linkableMenuItems,
}: {
  inventoryItemId: string;
  inventoryUnit: string;
  linkableMenuItems: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const res = await linkRecipeAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      form.reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="inventory_item_id" value={inventoryItemId} />

      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-zinc-700">
        Produs din meniu
        <select
          name="menu_item_id"
          required
          defaultValue=""
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="" disabled>— alegeți —</option>
          {linkableMenuItems.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>

      <label className="flex w-[160px] flex-col gap-1 text-xs font-medium text-zinc-700">
        Cantitate / porție ({inventoryUnit})
        <input
          name="qty_per_serving"
          type="number"
          step="0.0001"
          min="0.0001"
          required
          placeholder="0,200"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Se leagă…' : 'Adaugă rețetă'}
      </button>

      {error ? (
        <div role="alert" className="w-full rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}
    </form>
  );
}
