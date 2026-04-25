'use client';

import { useState, useTransition } from 'react';
import { PromoForm } from './promo-form';
import {
  togglePromoAction,
  deletePromoAction,
  type PromoKind,
} from './actions';

export type PromoRow = {
  id: string;
  code: string;
  kind: PromoKind;
  value_int: number;
  min_order_ron: number;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
};

type Mode = { kind: 'idle' } | { kind: 'create' } | { kind: 'edit'; promo: PromoRow };

export function PromosClient({
  initialPromos,
  tenantId,
}: {
  initialPromos: PromoRow[];
  tenantId: string;
}) {
  const [promos, setPromos] = useState<PromoRow[]>(initialPromos);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCreated(row: PromoRow) {
    setPromos((p) => [row, ...p]);
    setMode({ kind: 'idle' });
  }
  function onUpdated(row: PromoRow) {
    setPromos((p) => p.map((x) => (x.id === row.id ? row : x)));
    setMode({ kind: 'idle' });
  }

  function toggle(id: string, next: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await togglePromoAction(id, next, tenantId);
      if (!r.ok) setError(r.error);
      else setPromos((p) => p.map((x) => (x.id === id ? { ...x, is_active: next } : x)));
    });
  }

  function destroy(id: string) {
    if (!confirm('Ștergi acest cod? Codul nu mai poate fi aplicat de clienți.')) return;
    setError(null);
    startTransition(async () => {
      const r = await deletePromoAction(id, tenantId);
      if (!r.ok) setError(r.error);
      else setPromos((p) => p.filter((x) => x.id !== id));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {mode.kind === 'idle' && (
        <button
          type="button"
          onClick={() => setMode({ kind: 'create' })}
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Cod nou
        </button>
      )}

      {mode.kind === 'create' && (
        <PromoForm
          tenantId={tenantId}
          onSaved={(row) => onCreated(row)}
          onCancel={() => setMode({ kind: 'idle' })}
        />
      )}

      {mode.kind === 'edit' && (
        <PromoForm
          tenantId={tenantId}
          editing={mode.promo}
          onSaved={(row) => onUpdated(row)}
          onCancel={() => setMode({ kind: 'idle' })}
        />
      )}

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-600">
            <tr>
              <th className="px-3 py-2">Cod</th>
              <th className="px-3 py-2">Tip</th>
              <th className="px-3 py-2">Valoare</th>
              <th className="px-3 py-2">Min. comandă</th>
              <th className="px-3 py-2">Folosiri</th>
              <th className="px-3 py-2">Valabilitate</th>
              <th className="px-3 py-2">Activ</th>
              <th className="px-3 py-2 text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {promos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-zinc-500">
                  Niciun cod creat încă.
                </td>
              </tr>
            )}
            {promos.map((p) => (
              <tr key={p.id} className="text-zinc-800">
                <td className="px-3 py-2 font-mono text-xs font-semibold">{p.code}</td>
                <td className="px-3 py-2">{kindLabel(p.kind)}</td>
                <td className="px-3 py-2 tabular-nums">{valueLabel(p)}</td>
                <td className="px-3 py-2 tabular-nums">{p.min_order_ron} RON</td>
                <td className="px-3 py-2 tabular-nums">
                  {p.used_count}
                  {p.max_uses !== null ? ` / ${p.max_uses}` : ''}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">{windowLabel(p)}</td>
                <td className="px-3 py-2">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={p.is_active}
                      onChange={(e) => toggle(p.id, e.target.checked)}
                      disabled={pending}
                    />
                    <span className="text-xs text-zinc-600">{p.is_active ? 'Da' : 'Nu'}</span>
                  </label>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      onClick={() => setMode({ kind: 'edit', promo: p })}
                      className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      Editează
                    </button>
                    <button
                      type="button"
                      onClick={() => destroy(p.id)}
                      disabled={pending}
                      className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function kindLabel(k: PromoKind): string {
  if (k === 'PERCENT') return 'Procent';
  if (k === 'FIXED') return 'RON';
  return 'Livrare gratuită';
}

function valueLabel(p: PromoRow): string {
  if (p.kind === 'PERCENT') return `${p.value_int}%`;
  if (p.kind === 'FIXED') return `${p.value_int} RON`;
  return '—';
}

function windowLabel(p: PromoRow): string {
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('ro-RO') : '∞');
  return `${fmt(p.valid_from)} → ${fmt(p.valid_until)}`;
}
