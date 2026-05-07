'use client';

// Toggle form for the inventory feature flag. OWNER-only enforcement is
// repeated server-side in toggleInventoryEnabledAction.

import { useTransition, useState } from 'react';
import { toggleInventoryEnabledAction } from './actions';

export function InventoryToggleForm({
  initialEnabled,
  isOwner,
  itemCount,
  movementCount,
}: {
  initialEnabled: boolean;
  isOwner: boolean;
  itemCount: number;
  movementCount: number;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const onToggle = (next: boolean) => {
    if (!isOwner) return;
    // Disabling while items/movements exist requires a confirm-step click.
    if (!next && enabled && (itemCount > 0 || movementCount > 0) && !confirmDisable) {
      setConfirmDisable(true);
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set('enabled', next ? 'true' : 'false');
    startTransition(async () => {
      const res = await toggleInventoryEnabledAction(fd);
      if (res.ok) {
        setEnabled(res.enabled);
        setConfirmDisable(false);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            Modul de stocuri {enabled ? 'activ' : 'inactiv'}
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {enabled
              ? 'Stocul se decrementează automat la fiecare comandă livrată.'
              : 'Activați pentru a urmări ingrediente, rețete și mișcări de stoc.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Activează modulul de stocuri"
          disabled={!isOwner || isPending}
          onClick={() => onToggle(!enabled)}
          className={[
            'relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors',
            enabled ? 'bg-purple-600' : 'bg-zinc-200',
            !isOwner || isPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-0.5',
            ].join(' ')}
          />
        </button>
      </div>

      {!isOwner ? (
        <p className="text-xs text-zinc-500">
          Doar proprietarul restaurantului poate activa sau dezactiva acest modul.
        </p>
      ) : null}

      {confirmDisable ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-medium">Sigur dezactivați modulul?</p>
          <p className="mt-1">
            Stocul nu va mai fi actualizat automat la livrare. Datele existente
            ({itemCount} ingrediente, {movementCount} mișcări) se păstrează și
            redevin vizibile când reactivați modulul.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => onToggle(false)}
              className="inline-flex items-center justify-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? 'Se salvează…' : 'Da, dezactivează'}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmDisable(false)}
              className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Anulează
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
