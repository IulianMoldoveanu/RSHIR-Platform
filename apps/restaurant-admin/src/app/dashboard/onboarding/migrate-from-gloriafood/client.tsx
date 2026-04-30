'use client';

import { useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, toast } from '@hir/ui';
import {
  parseGloriaFoodCsv,
  commitGloriaFoodImport,
  type ParsedItem,
} from './actions';

const MAX_BYTES = 5 * 1024 * 1024;

// ── Staged progress messages shown while committing ────────────────────────
type CommitStage =
  | 'idle'
  | 'reading'
  | 'parsing'
  | 'importing'
  | 'done';

const STAGE_LABELS: Record<CommitStage, string> = {
  idle: '',
  reading: 'Se citește fișierul…',
  parsing: 'Se procesează meniul…',
  importing: 'Se importă produsele…',
  done: '',
};

// ── Error-type detection → specific guidance ──────────────────────────────
type ParseErrorKind =
  | 'missing_columns'
  | 'no_products'
  | 'empty_csv'
  | 'too_large'
  | 'generic';

function detectErrorKind(msg: string): ParseErrorKind {
  const m = msg.toLowerCase();
  if (m.includes('depășește 5 mb') || m.includes('depaseste 5 mb')) return 'too_large';
  if (m.includes('csv gol') || m.includes('header')) return 'empty_csv';
  if (m.includes('item name') || m.includes('price') || m.includes('coloan')) return 'missing_columns';
  if (m.includes('niciun produs')) return 'no_products';
  return 'generic';
}

function ParseErrorGuide({ kind, raw }: { kind: ParseErrorKind; raw: string }) {
  if (kind === 'missing_columns') {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
        <p className="font-semibold">CSV-ul nu conține coloanele necesare.</p>
        <p className="mt-1">
          {raw}
        </p>
        <p className="mt-2 font-medium">Coloane așteptate:</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-rose-800">
          <li><span className="font-mono">Category</span> — categoria produsului</li>
          <li><span className="font-mono">Item Name</span> — denumirea produsului (obligatorie)</li>
          <li><span className="font-mono">Description</span> — descriere scurtă</li>
          <li><span className="font-mono">Price</span> — prețul în RON (obligatoriu)</li>
        </ul>
        <p className="mt-2">
          Verificați că ați exportat din GloriaFood prin:{' '}
          <span className="font-medium">Settings → Menu → Export → CSV</span>.
        </p>
      </div>
    );
  }
  if (kind === 'no_products') {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-semibold">Niciun produs detectat în fișier.</p>
        <p className="mt-1">
          Fișierul pare valid, dar nu conține rânduri cu produse. Asigurați-vă că
          exportați <span className="font-medium">întregul meniu</span>, nu doar
          o categorie goală.
        </p>
      </div>
    );
  }
  if (kind === 'empty_csv') {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
        <p className="font-semibold">Fișierul CSV este gol sau corupt.</p>
        <p className="mt-1">
          Exportați din nou din GloriaFood și asigurați-vă că fișierul are cel
          puțin un rând de date.
        </p>
      </div>
    );
  }
  if (kind === 'too_large') {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
        <p className="font-semibold">Fișierul depășește 5 MB.</p>
        <p className="mt-1">
          Exportul standard GloriaFood nu ar trebui să depășească această
          limită. Dacă meniul este foarte mare, contactați-ne și vă ajutăm cu
          importul manual.
        </p>
      </div>
    );
  }
  // generic
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
      <p className="font-semibold">Eroare la procesare:</p>
      <p className="mt-1">{raw}</p>
    </div>
  );
}

// ── Success card shown after commit ───────────────────────────────────────
function SuccessCard({
  itemsCreated,
  categoriesCreated,
}: {
  itemsCreated: number;
  categoriesCreated: number;
}) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-5">
      <p className="text-xl">&#x1F389;</p>
      <h2 className="mt-2 text-base font-semibold text-emerald-900">
        Import finalizat cu succes!
      </h2>
      <p className="mt-1 text-sm text-emerald-800">
        Am importat{' '}
        <span className="font-semibold">{itemsCreated} produse</span> în{' '}
        <span className="font-semibold">
          {categoriesCreated}{' '}
          {categoriesCreated === 1 ? 'categorie nouă' : 'categorii noi'}
        </span>
        . Verificați meniul și publicați-l când sunteți gata — nimic nu este
        vizibil clienților până la publicare.
      </p>

      <div className="mt-4">
        <Link
          href="/dashboard/menu"
          className="inline-flex items-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Verifică meniul importat →
        </Link>
      </div>

      <div className="mt-4 border-t border-emerald-200 pt-4">
        <p className="text-xs font-medium text-emerald-900">
          Ce aveți în plus față de GloriaFood:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-emerald-800">
          <li className="flex gap-2">
            <span className="text-emerald-600">&#x2713;</span>
            <span>
              <span className="font-medium">Livrare în timp real</span> — urmărire
              GPS pentru fiecare comandă, fără costuri suplimentare
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600">&#x2713;</span>
            <span>
              <span className="font-medium">AI CEO</span> — recomandări zilnice
              (prețuri, ore de vârf, stocuri) direct în panoul dumneavoastră
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-600">&#x2713;</span>
            <span>
              <span className="font-medium">Aplicație mobilă proprie</span> — la
              brandul restaurantului dumneavoastră, fără comision de platformă
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────
export function MigrateClient({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [parseError, setParseError] = useState<{
    raw: string;
    kind: ParseErrorKind;
  } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [commitStage, setCommitStage] = useState<CommitStage>('idle');
  const [, startCommit] = useTransition();
  const [successResult, setSuccessResult] = useState<{
    itemsCreated: number;
    categoriesCreated: number;
  } | null>(null);
  const [stats, setStats] = useState<{ items: number; categories: number } | null>(
    null,
  );

  const committing = commitStage !== 'idle';

  async function onPickCsv(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setParseError({ raw: 'Fișierul depășește 5 MB.', kind: 'too_large' });
      setParsed(null);
      setStats(null);
      return;
    }
    setParsing(true);
    setParseError(null);
    setParsed(null);
    setStats(null);
    setSuccessResult(null);
    try {
      const text = await f.text();
      const result = await parseGloriaFoodCsv(tenantId, text);
      if (!result.ok) {
        setParseError({ raw: result.error, kind: detectErrorKind(result.error) });
        return;
      }
      setParsed(result.items);
      setStats({ items: result.itemCount, categories: result.categoryCount });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nu am putut procesa fișierul.';
      setParseError({ raw: msg, kind: 'generic' });
    } finally {
      setParsing(false);
    }
  }

  function onCommit() {
    if (!parsed || parsed.length === 0) return;
    setCommitStage('reading');
    startCommit(async () => {
      // Staged progress: we advance the label at natural await points inside
      // the action, but since it runs server-side we simulate stages by
      // updating state before and after the single roundtrip.
      setCommitStage('parsing');
      // Small delay so the user sees at least two stages before the network
      // call resolves. Avoids a flash of a single label.
      await new Promise((r) => setTimeout(r, 400));
      setCommitStage('importing');
      const result = await commitGloriaFoodImport({ tenantId, items: parsed });
      if (!result.ok) {
        toast.error(result.error);
        setCommitStage('idle');
        return;
      }
      setCommitStage('done');
      setSuccessResult({
        itemsCreated: result.itemsCreated,
        categoriesCreated: result.categoriesCreated,
      });
      // Pre-warm the menu route so navigation is instant.
      router.prefetch('/dashboard/menu');
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

  // ── Success screen ───────────────────────────────────────────────────────
  if (successResult) {
    return (
      <SuccessCard
        itemsCreated={successResult.itemsCreated}
        categoriesCreated={successResult.categoriesCreated}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Trust disclosure */}
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
        <span className="font-medium text-zinc-800">Cum funcționează importul:</span>{' '}
        Vom citi doar produsele și prețurile din fișierul dumneavoastră. Nu
        accesăm date despre clienți, comenzi sau plăți. Procesul durează 1–2
        minute, iar meniul importat{' '}
        <span className="font-medium text-zinc-800">
          nu se publică automat
        </span>{' '}
        — veți putea verifica și edita înainte de a fi vizibil clienților.
      </div>

      {/* Step 1: upload */}
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">
          Pas 1 — Încărcați CSV-ul exportat din GloriaFood
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          În contul GloriaFood:{' '}
          <span className="font-medium text-zinc-700">
            Settings → Menu → Export → CSV
          </span>
          . Susținem coloanele Category, Item Name, Description, Price (cu sau
          fără variante).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={parsing || committing}
            onChange={onPickCsv}
            aria-label="Selectați fișierul CSV exportat din GloriaFood"
            className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-700 disabled:opacity-50"
          />
          {parsing && (
            <span className="text-xs text-zinc-500" aria-live="polite">
              Se procesează fișierul…
            </span>
          )}
        </div>

        {/* Parse error with contextual guidance */}
        {parseError && (
          <div className="mt-3">
            <ParseErrorGuide kind={parseError.kind} raw={parseError.raw} />
          </div>
        )}
      </div>

      {/* Step 2: preview + review */}
      {parsed && parsed.length > 0 && stats && (
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          {/* Preview summary — what will be imported */}
          <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-semibold">Vom importa:</p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-blue-800">
              <li>
                &#x2022;{' '}
                <span className="font-medium">{stats.categories} categorii</span>
              </li>
              <li>
                &#x2022;{' '}
                <span className="font-medium">{stats.items} produse</span>
              </li>
              <li>&#x2022; Prețuri în RON</li>
              <li>&#x2022; Descrieri scurte (acolo unde există)</li>
              {flaggedCount > 0 && (
                <li className="text-amber-700">
                  &#x2022;{' '}
                  <span className="font-medium">{flaggedCount} produse</span>{' '}
                  vor fi importate dezactivate (preț neidentificabil) — le puteți
                  activa manual după import
                </li>
              )}
            </ul>
          </div>

          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              Pas 2 — Verificați produsele ({parsed.length})
            </h2>
            {flaggedCount > 0 && (
              <span className="text-xs text-amber-700" role="status">
                {flaggedCount} marcate cu probleme
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
                        <div className="text-amber-700">&#x26A0; {item.flagged}</div>
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
                          aria-label={item.flagged ? `Curăță marcaj pentru ${item.name}` : `Marchează ${item.name} cu problemă`}
                          className="text-zinc-500 hover:text-amber-700"
                        >
                          {item.flagged ? 'curăță' : 'flag'}
                        </button>
                        <span className="text-zinc-300" aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          aria-label={`Șterge ${item.name} din import`}
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
            <p className="text-xs text-zinc-500">
              Vor fi create {stats.categories}{' '}
              {stats.categories === 1 ? 'categorie' : 'categorii'} și{' '}
              {stats.items} produse. Categoriile cu același nume vor fi
              reutilizate.
            </p>
            <div className="flex items-center gap-3">
              {committing && (
                <span
                  className="text-xs text-zinc-500"
                  aria-live="polite"
                  role="status"
                >
                  {STAGE_LABELS[commitStage]}
                </span>
              )}
              <Button
                type="button"
                onClick={onCommit}
                disabled={committing || parsed.length === 0}
                aria-label="Confirmați și importați meniul în HIR"
              >
                {committing ? 'Se importă…' : 'Confirmă importul'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
