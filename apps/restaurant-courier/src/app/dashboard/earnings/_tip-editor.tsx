'use client';

import { useState, useTransition } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { setTipForDelivery } from './_tips-actions';

type Props = {
  deliveryId: string;
  initialTip: number;
};

export function TipEditor({ deliveryId, initialTip }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTip.toFixed(2));
  const [saved, setSaved] = useState(initialTip);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const display = saved > 0 ? `+${saved.toFixed(2)}` : '+ bacșiș';

  function commit() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
      setError('0–1000 RON');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await setTipForDelivery(deliveryId, parsed);
      if (res.ok) {
        setSaved(parsed);
        setEditing(false);
      } else {
        setError(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(saved.toFixed(2));
          setEditing(true);
        }}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors ${
          saved > 0
            ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30'
            : 'bg-hir-border/50 text-hir-muted-fg ring-1 ring-inset ring-hir-border hover:text-violet-200'
        }`}
        aria-label={saved > 0 ? `Editează bacșiș ${saved.toFixed(2)} RON` : 'Adaugă bacșiș'}
      >
        <Pencil className="h-3 w-3" aria-hidden />
        {display}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={1000}
        step={0.5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        disabled={isPending}
        aria-label="Suma bacșiș în RON"
        className="w-14 rounded-md border border-hir-border bg-hir-bg px-1.5 py-1 text-[11px] tabular-nums text-hir-fg outline-none focus:border-violet-500"
        autoFocus
      />
      <button
        type="button"
        onClick={commit}
        disabled={isPending}
        aria-label="Salvează bacșiș"
        className="rounded-md bg-emerald-500/20 p-1 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
      >
        <Check className="h-3 w-3" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(saved.toFixed(2));
          setEditing(false);
          setError(null);
        }}
        disabled={isPending}
        aria-label="Anulează"
        className="rounded-md bg-hir-border/50 p-1 text-hir-muted-fg hover:bg-hir-border"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
      {error ? <span className="text-[10px] text-rose-300">{error}</span> : null}
    </div>
  );
}
