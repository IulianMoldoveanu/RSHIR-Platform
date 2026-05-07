'use client';

// Lane INVENTORY-FOLLOWUP PR 3b — manual stock adjustment form on the
// item detail page. Submits via the manualAdjustStockAction server action.
// Delta can be positive (add stock) or negative (remove). A free-text
// reason is required and persisted into inventory_movements.metadata.note.

import { useTransition, useState } from 'react';
import { manualAdjustStockAction } from '../actions';

export function ManualAdjustForm({
  inventoryItemId,
  unit,
}: {
  inventoryItemId: string;
  unit: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  return (
    <form
      action={(formData) => {
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          const res = await manualAdjustStockAction(formData);
          if (res.ok) {
            setSuccess(true);
            // Reset the inputs by reading the form node from FormData.
            // We rely on revalidatePath on the server side to refresh the
            // ledger + current stock; the inputs reset via key bumping.
          } else {
            setError(res.error);
          }
        });
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,2fr,auto]"
    >
      <input type="hidden" name="inventory_item_id" value={inventoryItemId} />

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-700">Delta ({unit})</span>
        <input
          type="number"
          name="delta"
          step="0.001"
          required
          placeholder="ex. -0,5 sau 2"
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-200"
        />
        <span className="text-zinc-500">
          Negativ pentru scădere, pozitiv pentru adăugare.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-700">Motiv</span>
        <input
          type="text"
          name="reason_note"
          required
          maxLength={200}
          placeholder="ex. inventar fizic, pierdere la depozitare"
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-200"
        />
      </label>

      <div className="flex items-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Se salvează…' : 'Aplică ajustarea'}
        </button>
      </div>

      {error ? (
        <p role="alert" className="sm:col-span-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="sm:col-span-3 text-xs text-emerald-700">
          Ajustare aplicată. Stocul curent și jurnalul s-au actualizat.
        </p>
      ) : null}
    </form>
  );
}
