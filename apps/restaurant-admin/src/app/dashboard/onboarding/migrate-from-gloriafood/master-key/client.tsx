'use client';

import { useState, useTransition } from 'react';
import {
  parseGloriaFoodMasterKey,
  commitGloriaFoodImport,
  type ParsedItem,
  type ParseResult,
  type CommitResult,
} from '../actions';

type Stage = 'KEY' | 'PREVIEW' | 'COMMITTING' | 'DONE' | 'ERROR';

export function MasterKeyClient({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [stage, setStage] = useState<Stage>('KEY');
  const [masterKey, setMasterKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [categoryCount, setCategoryCount] = useState(0);
  const [result, setResult] = useState<{ categoriesCreated: number; itemsCreated: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStage('KEY');
    setError(null);
    setItems([]);
    setResult(null);
  }

  async function handlePreview() {
    setError(null);
    startTransition(async () => {
      const r: ParseResult = await parseGloriaFoodMasterKey(tenantId, masterKey.trim());
      if (!r.ok) {
        setError(r.error);
        setStage('ERROR');
        return;
      }
      setItems(r.items);
      setItemCount(r.itemCount);
      setCategoryCount(r.categoryCount);
      setStage('PREVIEW');
    });
  }

  async function handleCommit() {
    setError(null);
    setStage('COMMITTING');
    startTransition(async () => {
      const r: CommitResult = await commitGloriaFoodImport({ tenantId, items });
      if (!r.ok) {
        setError(r.error);
        setStage('ERROR');
        return;
      }
      setResult({ categoriesCreated: r.categoriesCreated, itemsCreated: r.itemsCreated });
      setStage('DONE');
    });
  }

  if (stage === 'DONE' && result) {
    return (
      <div className="rounded-md border border-[#A7F3D0] bg-[#ECFDF5] p-5">
        <div className="text-sm font-semibold text-[#047857]">Import reușit ✓</div>
        <p className="mt-2 text-sm text-[#047857]">
          Pentru tenant <strong>{tenantName}</strong>: {result.categoriesCreated} categorii noi,{' '}
          {result.itemsCreated} produse importate.
        </p>
        <div className="mt-4 flex gap-3">
          <a
            href="/dashboard/menu"
            className="inline-flex items-center rounded-md bg-[#047857] px-4 py-2 text-sm font-medium text-white hover:bg-[#065F46]"
          >
            Vezi meniul
          </a>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            Importă alta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Master Key */}
      <section className="rounded-lg border border-[#E2E8F0] bg-white p-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#475569]">Pasul 1</div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[#0F172A]">Master Key GloriaFood</span>
          <input
            type="text"
            value={masterKey}
            onChange={(e) => setMasterKey(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 font-mono text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
            placeholder="ex: 1234abcd-5678-..."
            disabled={stage !== 'KEY' && stage !== 'ERROR'}
          />
        </label>
        {stage === 'KEY' || stage === 'ERROR' ? (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-[#94a3b8]">
              GloriaFood Admin → <em>Setup → Master Key</em>
            </p>
            <button
              type="button"
              onClick={handlePreview}
              disabled={pending || masterKey.trim().length < 20}
              className="inline-flex items-center rounded-md bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA] disabled:opacity-50"
            >
              {pending ? 'Se obține…' : 'Preview meniu'}
            </button>
          </div>
        ) : null}
      </section>

      {/* Step 2: Preview */}
      {(stage === 'PREVIEW' || stage === 'COMMITTING') && (
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#475569]">Pasul 2</div>
          <div className="mb-3 flex items-baseline gap-4">
            <div>
              <div className="text-xs text-[#475569]">Categorii</div>
              <div className="text-2xl font-semibold tracking-tight" style={{ fontFeatureSettings: '"tnum"' }}>
                {categoryCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#475569]">Produse</div>
              <div className="text-2xl font-semibold tracking-tight" style={{ fontFeatureSettings: '"tnum"' }}>
                {itemCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#475569]">Flagged</div>
              <div className="text-2xl font-semibold tracking-tight text-[#B45309]" style={{ fontFeatureSettings: '"tnum"' }}>
                {items.filter((i) => i.flagged).length}
              </div>
            </div>
          </div>

          <div className="mb-4 max-h-72 overflow-auto rounded-md border border-[#E2E8F0]">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-xs uppercase tracking-wide text-[#475569]">
                  <th className="px-3 py-2 font-medium">Categorie</th>
                  <th className="px-3 py-2 font-medium">Produs</th>
                  <th className="px-3 py-2 font-medium text-right">Preț</th>
                  <th className="px-3 py-2 font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 100).map((it, i) => (
                  <tr key={i} className="border-t border-[#F1F5F9]">
                    <td className="px-3 py-2 text-[#475569]">{it.category}</td>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-right font-mono">{it.price_ron.toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs text-[#B45309]">{it.flagged ?? ''}</td>
                  </tr>
                ))}
                {items.length > 100 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-center text-xs text-[#94a3b8]">
                      … și încă {items.length - 100} produse (vor fi importate toate)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={reset}
              className="text-sm text-[#475569] underline"
              disabled={pending}
            >
              Înapoi
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={pending || stage === 'COMMITTING'}
              className="inline-flex items-center rounded-md bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA] disabled:opacity-50"
            >
              {stage === 'COMMITTING' || pending ? 'Se importă…' : `Importă ${itemCount} produse`}
            </button>
          </div>
        </section>
      )}

      {error ? (
        <div className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">{error}</div>
      ) : null}
    </div>
  );
}
