'use client';

// Pipeline kanban — 5 columns (LEAD/DEMO/CONTRACT/LIVE/CHURNED).
// Server provides the data; this client wrapper adds:
//   - search by tenant name (case-insensitive)
//   - filter by stage (chip toggles)
//   - per-column empty state
//   - card hover micro-affordance
//
// Drag-and-drop is intentionally NOT included (see partner-portal/page.tsx
// comment: "drag-drop / explicit moves come in a follow-up PR"). We only
// improve presentation here — server-rendered data, client-side filtering.

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export type KanbanState = 'LEAD' | 'DEMO' | 'CONTRACT' | 'LIVE' | 'CHURNED';

export type KanbanItem = {
  id: string;
  tenant_name: string;
  referred_at: string;
  state: KanbanState;
};

type ColumnDef = { state: KanbanState; label: string; tone: string };

const COLUMNS: ColumnDef[] = [
  { state: 'LEAD', label: 'Lead', tone: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  { state: 'DEMO', label: 'Demo', tone: 'bg-amber-100 text-amber-800 ring-amber-200' },
  {
    state: 'CONTRACT',
    label: 'Contract',
    tone: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  },
  { state: 'LIVE', label: 'Live', tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  {
    state: 'CHURNED',
    label: 'Churned',
    tone: 'bg-rose-100 text-rose-700 ring-rose-200',
  },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export function PipelineKanban({ items }: { items: KanbanItem[] }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<KanbanState | 'ALL'>('ALL');

  const normalized = query.trim().toLocaleLowerCase('ro-RO');

  const filtered = useMemo(() => {
    return items.filter((r) => {
      if (active !== 'ALL' && r.state !== active) return false;
      if (normalized && !r.tenant_name.toLocaleLowerCase('ro-RO').includes(normalized))
        return false;
      return true;
    });
  }, [items, active, normalized]);

  const grouped = useMemo(() => {
    const m = new Map<KanbanState, KanbanItem[]>();
    for (const col of COLUMNS) m.set(col.state, []);
    for (const r of filtered) m.get(r.state)?.push(r);
    return m;
  }, [filtered]);

  return (
    <section aria-label="Pipeline referrals">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Pipeline</h2>
          <span className="text-xs text-zinc-400">
            {filtered.length}/{items.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Caută vendor</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Caută vendor…"
              className="w-44 rounded-md border border-zinc-200 bg-white py-1.5 pl-7 pr-2 text-xs placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </label>

          <div
            role="group"
            aria-label="Filtrează după stadiu"
            className="flex flex-wrap items-center gap-1 rounded-md border border-zinc-200 bg-white p-0.5"
          >
            <button
              type="button"
              onClick={() => setActive('ALL')}
              aria-pressed={active === 'ALL'}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                active === 'ALL'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              Toate
            </button>
            {COLUMNS.map((c) => (
              <button
                key={c.state}
                type="button"
                onClick={() => setActive(c.state)}
                aria-pressed={active === c.state}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                  active === c.state
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">
            Pipeline-ul tău se populează automat când distribui linkul de mai
            sus.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = grouped.get(col.state) ?? [];
            return (
              <div
                key={col.state}
                className="flex min-h-[160px] flex-col rounded-xl border border-zinc-200 bg-white p-3 transition-colors"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${col.tone}`}
                  >
                    {col.label}
                  </span>
                  <span className="text-xs tabular-nums text-zinc-400">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {items.length === 0 ? (
                    <p className="text-[11px] text-zinc-400">
                      Niciun vendor în acest stadiu.
                    </p>
                  ) : (
                    items.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-md border border-zinc-100 bg-zinc-50/60 p-2 transition-colors hover:border-purple-200 hover:bg-purple-50/40"
                        title={`Referit la ${fmtDate(r.referred_at)}`}
                      >
                        <p className="truncate text-xs font-medium text-zinc-900">
                          {r.tenant_name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-zinc-500">
                          {fmtDate(r.referred_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
