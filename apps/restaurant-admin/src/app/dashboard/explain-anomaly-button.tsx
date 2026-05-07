'use client';

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';

// "Explică această cifră" — single-button surface per KPI card on /dashboard.
// Calls /api/ai/explain-anomaly which proxies to the analytics-explain-anomaly
// Edge Function. Renders 2-3 ranked hypotheses inline as a dropdown panel
// anchored to the button. NO new tabs (per Lane brief).
//
// Read-only intent: the dispatcher bypasses the trust gate and writes an
// EXECUTED ledger row to copilot_agent_runs. Per-day cap (5/tenant) is
// enforced in the Edge Function — the API returns `capped: true` and a
// single explanation message when reached.

export type ExplainMetric = 'orders' | 'revenue' | 'aov';

type Hypothesis = { rank: number; text: string };

type ExplainResponse = {
  ok?: boolean;
  metric?: ExplainMetric;
  capped?: boolean;
  hypotheses?: Hypothesis[];
  cost_usd?: number;
  used_today?: number;
  cap_per_day?: number;
  error?: string;
};

const METRIC_LABEL: Record<ExplainMetric, string> = {
  orders: 'comenzilor',
  revenue: 'încasărilor',
  aov: 'coșului mediu',
};

export function ExplainAnomalyButton({ metric }: { metric: ExplainMetric }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setOpen(true);
    try {
      const r = await fetch('/api/ai/explain-anomaly', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metric, dateRange: 'today' }),
      });
      const data = (await r.json()) as ExplainResponse;
      if (!r.ok) {
        setError(data?.error ?? `HTTP ${r.status}`);
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={run}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-800 transition-colors hover:bg-purple-100"
        aria-label={`Explică cifra ${METRIC_LABEL[metric]}`}
      >
        <Sparkles className="h-3 w-3" aria-hidden />
        Explică această cifră
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Explicație ${METRIC_LABEL[metric]}`}
          className="absolute left-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-3 shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">
              Hepy explică · {METRIC_LABEL[metric]}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Închide"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {loading && (
            <p className="mt-2 text-xs text-zinc-600">Asistentul AI analizează datele...</p>
          )}
          {error && !loading && (
            <p className="mt-2 text-xs text-rose-700">
              Nu am putut obține o explicație. Reîncercați mai târziu.
            </p>
          )}
          {result && !loading && Array.isArray(result.hypotheses) && (
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-800">
              {result.hypotheses.map((h) => (
                <li key={h.rank} className="flex gap-2">
                  <span className="flex-none rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">
                    {h.rank}
                  </span>
                  <span>{h.text}</span>
                </li>
              ))}
            </ul>
          )}
          {result?.capped && (
            <p className="mt-2 text-[10px] text-amber-700">
              Limită zilnică atinsă ({result.cap_per_day ?? 5} explicații/zi).
            </p>
          )}
          {result && !result.capped && typeof result.used_today === 'number' && (
            <p className="mt-2 text-[10px] text-zinc-400">
              {result.used_today}/{result.cap_per_day ?? 5} explicații folosite azi.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
