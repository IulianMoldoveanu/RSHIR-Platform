'use client';

import { useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, toast } from '@hir/ui';
import {
  parseGloriaFoodCsv,
  commitGloriaFoodImport,
  type ParsedItem,
} from './actions';

const MAX_BYTES = 5 * 1024 * 1024;

export function MigrateClient({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, startCommit] = useTransition();
  const [stats, setStats] = useState<{ items: number; categories: number } | null>(
    null,
  );

  async function onPickCsv(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error('Fișierul depășește 5 MB.');
      return;
    }
    setParsing(true);
    try {
      const text = await f.text();
      const result = await parseGloriaFoodCsv(tenantId, text);
      if (!result.ok) {
        toast.error(result.error);
        setParsed(null);
        setStats(null);
        return;
      }
      setParsed(result.items);
      setStats({ items: result.itemCount, categories: result.categoryCount });
      toast.success(
        `${result.itemCount} produse în ${result.categoryCount} categorii. Verificați și apăsați "Importă".`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Nu am putut procesa fișierul.',
      );
    } finally {
      setParsing(false);
    }
  }

  function onCommit() {
    if (!parsed || parsed.length === 0) return;
    startCommit(async () => {
      const result = await commitGloriaFoodImport({ tenantId, items: parsed });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Import reușit: ${result.itemsCreated} produse în ${result.categoriesCreated} categorii noi.`,
      );
      router.push('/dashboard/menu');
      router.refresh();
    });
  }

  function toggleFlagged(idx: number) {
    if (!parsed) return;
    const next = [...parsed];
    next[idx] = { ...next[idx], flagged: next[idx].flagged ? null : 'manual' };
    setParsed(next);
  }

  function removeRow(idx: number) {
    if (!parsed) return;
    setParsed(parsed.filter((_, i) => i !== idx));
  }

  const flaggedCount = parsed?.filter((i) => i.flagged).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Step 1: upload */}
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">
          Pas 1 — Încarcă CSV-ul exportat din GloriaFood
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          În contul GloriaFood: Settings → Menu → Export → CSV. Susținem
          coloanele Category, Item Name, Description, Price (cu sau fără
          variante).
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={parsing || committing}
            onChange={onPickCsv}
            className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-700"
          />
          {parsing && (
            <span className="text-xs text-zinc-500">se procesează…</span>
          )}
        </div>
      </div>

      {/* Step 2: review */}
      {parsed && parsed.length > 0 && (
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              Pas 2 — Verifică ({parsed.length} produse)
            </h2>
            {flaggedCount > 0 && (
              <span className="text-xs text-amber-700">
                {flaggedCount} marcate cu probleme. Vor fi importate dezactivate.
              </span>
            )}
          </div>
          <div className="mt-3 max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <th className="px-2 py-1">Categorie</th>
                  <th className="px-2 py-1">Produs</th>
                  <th className="px-2 py-1 text-right">Preț (RON)</th>
                  <th className="px-2 py-1">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {parsed.map((item, idx) => (
                  <tr
                    key={idx}
                    className={item.flagged ? 'bg-amber-50' : 'bg-white'}
                  >
                    <td className="px-2 py-1.5 text-zinc-700">{item.category}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-zinc-900">{item.name}</div>
                      {item.description && (
                        <div className="text-zinc-500">{item.description}</div>
                      )}
                      {item.flagged && (
                        <div className="text-amber-700">⚠ {item.flagged}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-900">
                      {item.price_ron.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => toggleFlagged(idx)}
                          className="text-zinc-500 hover:text-amber-700"
                        >
                          {item.flagged ? 'curăță' : 'flag'}
                        </button>
                        <span className="text-zinc-300">·</span>
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-zinc-500 hover:text-rose-700"
                        >
                          șterge
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Step 3: commit */}
          <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
            <p className="text-xs text-zinc-500">
              Vor fi create {stats?.categories} categorii și {stats?.items} produse.
              Categoriile cu același nume vor fi reutilizate.
            </p>
            <Button
              type="button"
              onClick={onCommit}
              disabled={committing || parsed.length === 0}
            >
              {committing ? 'Se importă…' : 'Importă în meniu'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
