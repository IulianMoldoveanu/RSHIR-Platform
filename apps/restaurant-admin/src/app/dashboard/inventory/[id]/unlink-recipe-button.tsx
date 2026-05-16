'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@hir/ui';
import { unlinkRecipeAction } from '../actions';

export function UnlinkRecipeButton({
  recipeId,
  inventoryItemId,
}: {
  recipeId: string;
  inventoryItemId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    if (!window.confirm('Ștergeți această rețetă?')) return;
    const fd = new FormData();
    fd.set('id', recipeId);
    fd.set('inventory_item_id', inventoryItemId);
    startTransition(async () => {
      const res = await unlinkRecipeAction(fd);
      if (!res.ok) {
        toast.error(`Eroare: ${res.error}`);
        return;
      }
      toast.success('Rețetă ștearsă');
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-xs font-medium text-rose-600 transition-colors hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? '…' : 'Șterge'}
    </button>
  );
}
