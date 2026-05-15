'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Shape written by autoAssignOrderAction into audit_log.metadata.score_breakdown.
type ScoreFactor = {
  distanceKm: number | null;
  distanceScore: number;
  activeLoad: number;
  loadScore: number;
  vehicleMatch: boolean;
  vehicleScore: number;
  onShiftBonus: number;
};

type WinnerBreakdown = {
  courier_user_id: string;
  total_score: number;
  factors: ScoreFactor;
};

type Top3Entry = {
  courier_user_id: string;
  total_score: number;
  distance_km: number | null;
  active_load: number;
  load_score: number;
  distance_score: number;
};

export type ScoreBreakdown = {
  winner: WinnerBreakdown;
  top3: Top3Entry[];
};

type Props = {
  // The score_breakdown object from audit_log.metadata.
  breakdown: ScoreBreakdown;
  // Display name of the assigned courier, for the collapsed summary.
  courierName: string | null;
};

function fmt(km: number | null): string {
  if (km === null || !Number.isFinite(km)) return 'GPS lipsă';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function WhyAssigned({ breakdown, courierName }: Props) {
  const [open, setOpen] = useState(false);

  const { winner } = breakdown;
  const { factors } = winner;

  // Collapsed one-liner: "De ce acest curier? · 87/100 · 1.2 km · 0 livrări active"
  const summary = [
    `${winner.total_score}/100`,
    fmt(factors.distanceKm),
    `${factors.activeLoad} livrări active`,
  ].join(' · ');

  return (
    <section className="rounded-2xl border border-hir-border bg-hir-surface">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold text-hir-muted-fg">
            De ce{courierName ? ` ${courierName}` : ' acest curier'}?
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{summary}</p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="border-t border-hir-border px-5 pb-5 pt-4">
          {/* Winner detail */}
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Scor curier ales
          </p>
          <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <ScoreRow
              label="Scor total"
              value={`${winner.total_score} / 100`}
              highlight
            />
            <ScoreRow
              label="Distanță preluare"
              value={fmt(factors.distanceKm)}
            />
            <ScoreRow
              label="Puncte distanță"
              value={String(factors.distanceScore)}
            />
            <ScoreRow
              label="Livrări active"
              value={String(factors.activeLoad)}
            />
            <ScoreRow
              label="Puncte încărcare"
              value={String(factors.loadScore)}
            />
          </div>

          {/* Note about vehicle matching */}
          <p className="mb-4 text-[11px] text-zinc-500">
            Potrivire vehicul: nu este aplicată în versiunea curentă a algoritmului.
          </p>

          {/* Top-3 comparison table */}
          {breakdown.top3.length > 1 ? (
            <>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Top {breakdown.top3.length} candidați
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-hir-fg">
                  <thead>
                    <tr className="border-b border-hir-border text-[10px] text-zinc-500">
                      <th className="pb-1 pr-3 text-left font-medium">Curier</th>
                      <th className="pb-1 pr-3 text-right font-medium">Scor</th>
                      <th className="pb-1 pr-3 text-right font-medium">Distanță</th>
                      <th className="pb-1 text-right font-medium">Activ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.top3.map((row, idx) => (
                      <tr
                        key={row.courier_user_id}
                        className={`border-b border-hir-border/50 ${idx === 0 ? 'text-violet-300' : 'text-hir-muted-fg'}`}
                      >
                        <td className="py-1 pr-3 font-mono text-[10px]">
                          {row.courier_user_id.slice(0, 8)}
                          {idx === 0 ? ' ✓' : ''}
                        </td>
                        <td className="py-1 pr-3 text-right">{row.total_score}</td>
                        <td className="py-1 pr-3 text-right">{fmt(row.distance_km)}</td>
                        <td className="py-1 text-right">{row.active_load}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ScoreRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p
        className={`font-semibold ${highlight ? 'text-violet-300' : 'text-hir-fg'}`}
      >
        {value}
      </p>
    </div>
  );
}
