'use client';

import { useMemo } from 'react';
import { Button, Input } from '@hir/ui';

export type ReviewRow = {
  id: string;
  include: boolean;
  category: string;
  name: string;
  description: string;
  price_ron: number;
  flagged: boolean;
};

export function ReviewTable({
  rows,
  onChange,
  onSubmit,
  onReset,
  submitting,
}: {
  rows: ReviewRow[];
  onChange: (rows: ReviewRow[]) => void;
  onSubmit: (selected: ReviewRow[]) => void;
  onReset: () => void;
  submitting: boolean;
}) {
  const selectedCount = useMemo(() => rows.filter((r) => r.include).length, [rows]);

  function update(id: string, patch: Partial<ReviewRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function setAll(include: boolean) {
    onChange(rows.map((r) => ({ ...r, include })));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-4 py-3">
        <div className="text-sm">
          <span className="font-medium text-zinc-900">{selectedCount}</span>
          <span className="text-zinc-500"> / {rows.length} produse selectate</span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setAll(true)}>
            Toate
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAll(false)}>
            Niciunul
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="w-10 px-3 py-2 text-left">✓</th>
              <th className="px-3 py-2 text-left">Categorie</th>
              <th className="px-3 py-2 text-left">Produs</th>
              <th className="px-3 py-2 text-left">Descriere</th>
              <th className="w-28 px-3 py-2 text-right">Pret (RON)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={
                  r.flagged
                    ? 'border-t border-zinc-200 bg-amber-50/40'
                    : 'border-t border-zinc-200'
                }
              >
                <td className="px-3 py-2 align-top">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => update(r.id, { include: e.target.checked })}
                    className="h-4 w-4"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    value={r.category}
                    onChange={(e) => update(r.id, { category: e.target.value })}
                    className="h-8"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    value={r.name}
                    onChange={(e) => update(r.id, { name: e.target.value })}
                    className="h-8"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    value={r.description}
                    onChange={(e) => update(r.id, { description: e.target.value })}
                    className="h-8"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={r.price_ron}
                    onChange={(e) =>
                      update(r.id, { price_ron: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-right"
                  />
                  {r.flagged && (
                    <p className="mt-1 text-[10px] text-amber-700">verifica pretul</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onReset} disabled={submitting}>
          Reseteaza
        </Button>
        <Button
          type="button"
          onClick={() => onSubmit(rows.filter((r) => r.include))}
          disabled={submitting || selectedCount === 0}
        >
          {submitting ? 'Se importa...' : `Importa ${selectedCount} produse`}
        </Button>
      </div>
    </div>
  );
}
