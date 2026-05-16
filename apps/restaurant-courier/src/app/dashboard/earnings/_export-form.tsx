'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1; // 1-12

const MONTHS: { value: number; label: string }[] = [
  { value: 1, label: 'Ianuarie' },
  { value: 2, label: 'Februarie' },
  { value: 3, label: 'Martie' },
  { value: 4, label: 'Aprilie' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Iunie' },
  { value: 7, label: 'Iulie' },
  { value: 8, label: 'August' },
  { value: 9, label: 'Septembrie' },
  { value: 10, label: 'Octombrie' },
  { value: 11, label: 'Noiembrie' },
  { value: 12, label: 'Decembrie' },
];

// Generate a small range of years: current year and 2 previous ones.
const YEARS = [currentYear - 2, currentYear - 1, currentYear].filter(
  (y) => y >= 2024,
);

export function ExportForm() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  // 'month' | 'year' — annual export omits month param
  const [mode, setMode] = useState<'month' | 'year'>('month');

  const href =
    mode === 'month'
      ? `/dashboard/earnings/export?year=${year}&month=${month}`
      : `/dashboard/earnings/export?year=${year}`;

  return (
    <section
      aria-label="Export raport fiscal"
      className="rounded-2xl border border-hir-border bg-hir-surface p-4"
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Raport fiscal (PFA / autointreprinzător)
      </p>

      {/* Mode toggle */}
      <div
        role="group"
        aria-label="Tip perioadă"
        className="mb-4 flex gap-2"
      >
        <button
          type="button"
          onClick={() => setMode('month')}
          aria-pressed={mode === 'month'}
          className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
            mode === 'month'
              ? 'border-violet-500/60 bg-violet-500/10 text-violet-200'
              : 'border-hir-border text-hir-muted-fg hover:border-violet-500/40 hover:text-hir-fg'
          }`}
        >
          Lunar
        </button>
        <button
          type="button"
          onClick={() => setMode('year')}
          aria-pressed={mode === 'year'}
          className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
            mode === 'year'
              ? 'border-violet-500/60 bg-violet-500/10 text-violet-200'
              : 'border-hir-border text-hir-muted-fg hover:border-violet-500/40 hover:text-hir-fg'
          }`}
        >
          Anual
        </button>
      </div>

      {/* Selectors */}
      <div className="mb-4 flex gap-2">
        {mode === 'month' && (
          <div className="flex-1">
            <label
              htmlFor="export-month"
              className="mb-1 block text-[11px] text-zinc-500"
            >
              Luna
            </label>
            <select
              id="export-month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-hir-border bg-zinc-900 px-3 text-sm text-hir-fg focus:border-violet-500 focus:outline-none"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={mode === 'month' ? 'w-28' : 'flex-1'}>
          <label
            htmlFor="export-year"
            className="mb-1 block text-[11px] text-zinc-500"
          >
            An
          </label>
          <select
            id="export-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-11 w-full rounded-xl border border-hir-border bg-zinc-900 px-3 text-sm text-hir-fg focus:border-violet-500 focus:outline-none"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Download link — rendered as <a download> so the browser triggers
          the file save without navigation. The href is a server route that
          returns Content-Disposition: attachment. */}
      <a
        href={href}
        download
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-sm font-semibold text-violet-200 hover:border-violet-400 hover:bg-violet-500/15 active:scale-[0.99]"
        aria-label={
          mode === 'month'
            ? `Descarca raport CSV pentru ${MONTHS.find((m) => m.value === month)?.label ?? ''} ${year}`
            : `Descarca raport CSV anual ${year}`
        }
      >
        <Download className="h-4 w-4" aria-hidden />
        {mode === 'month'
          ? 'Descarca raport lunar CSV'
          : `Descarca raport anual ${year} CSV`}
      </a>

      <p className="mt-2 text-[11px] text-zinc-500">
        Format compatibil Excel RO (UTF-8, separator{' '}
        <code className="font-mono">;</code>). Coloane: data, comenzi, km,
        venit brut, comision HIR, venit net.
      </p>
    </section>
  );
}
