// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// DriverScoreCard — courier-private composite score 0..100 with breakdown.
//
// Per board verdict: couriers see THEIR OWN driver_score numeric (Bolt-style
// rolling 100-delivery), NOT a public 5-star score. The 4 factor bars are
// surfaced so the courier understands which dimension is dragging the score
// down (accept rate / on-time / completion / cancellation).
//
// Weights echo the SQL composite in `fn_recalc_driver_score`:
//   completion 40% · on-time 30% · accept 20% · (1 - cancel) 10%
// → We label the bars with those weights so the courier sees what moves
//   the needle most.
//
// Visuals:
//   • Big numeric score with tier-coloured ring (Bolt-inspired).
//   • Last-recompute timestamp.
//   • 4 progress bars with the breakdown.
//   • Optional "rolling window" hint (last 100 deliveries).

import * as React from 'react';

export interface DriverScoreBreakdown {
  readonly accept_rate: number;          // 0..1
  readonly on_time_rate: number;         // 0..1
  readonly completion_rate: number;      // 0..1
  readonly cancellation_rate: number;    // 0..1
  readonly counts?: {
    readonly accepted: number;
    readonly on_time: number;
    readonly completed: number;
    readonly cancelled: number;
    readonly total: number;
  };
}

export interface DriverScoreCardProps {
  readonly score: number;                 // 0..100
  readonly breakdown: DriverScoreBreakdown;
  readonly lastCalculatedAt: string | null;
  readonly rollingWindowCount?: number;
  readonly className?: string;
}

function scoreRingColor(score: number): string {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 70) return 'text-violet-400';
  if (score >= 55) return 'text-amber-400';
  return 'text-rose-400';
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '0%';
  const clamped = Math.max(0, Math.min(1, v));
  return `${Math.round(clamped * 100)}%`;
}

function FactorBar({
  label,
  value,
  weight,
  inverse = false,
}: {
  label: string;
  value: number;
  weight: number;
  inverse?: boolean;
}) {
  // For cancellation_rate, lower is better — display the bar inverted so the
  // courier can read "longer bar = better behaviour" consistently.
  const display = inverse ? 1 - value : value;
  const pct = Math.max(0, Math.min(1, display)) * 100;
  const tone = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-violet-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-hir-muted-fg">
        <span>
          {label}{' '}
          <span className="text-hir-muted-fg/70">({weight}%)</span>
        </span>
        <span className="font-medium tabular-nums text-hir-fg">
          {fmtPct(inverse ? value : display)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-hir-border/40">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${tone}`}
          style={{ width: `${pct.toFixed(1)}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
    </div>
  );
}

export function DriverScoreCard({
  score,
  breakdown,
  lastCalculatedAt,
  rollingWindowCount = 100,
  className,
}: DriverScoreCardProps): JSX.Element {
  const ringTone = scoreRingColor(score);
  const totalCount = breakdown.counts?.total ?? 0;
  const updated = lastCalculatedAt
    ? new Intl.DateTimeFormat('ro-RO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(lastCalculatedAt))
    : '—';

  return (
    <div
      className={[
        'rounded-2xl border border-hir-border bg-hir-surface p-5',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start gap-5">
        {/* Big numeric score */}
        <div
          className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 ${ringTone}`}
          style={{ borderColor: 'currentColor' }}
          aria-label={`Scor șofer ${Math.round(score)} din 100`}
        >
          <div className="text-center">
            <div className={`text-3xl font-bold tabular-nums ${ringTone}`}>
              {Math.round(score)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-hir-muted-fg">
              / 100
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-hir-fg">Scorul tău de șofer</h3>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            Ultimele {totalCount > 0 ? Math.min(totalCount, rollingWindowCount) : rollingWindowCount} livrări ·
            actualizat {updated}
          </p>
          <p className="mt-2 text-[11px] text-hir-muted-fg">
            Scorul e privat — vezi doar tu. Flota vede media flotei (Gold/Silver/Bronze),
            nu cifra ta.
          </p>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="mt-5 flex flex-col gap-3">
        <FactorBar
          label="Livrate"
          value={breakdown.completion_rate}
          weight={40}
        />
        <FactorBar
          label="La timp"
          value={breakdown.on_time_rate}
          weight={30}
        />
        <FactorBar
          label="Acceptate"
          value={breakdown.accept_rate}
          weight={20}
        />
        <FactorBar
          label="Fără anulări"
          value={breakdown.cancellation_rate}
          weight={10}
          inverse
        />
      </div>
    </div>
  );
}
