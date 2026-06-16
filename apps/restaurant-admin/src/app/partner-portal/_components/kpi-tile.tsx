// Server-safe premium KPI tile with optional inline sparkline + delta.
//
// Used in /partner-portal/page.tsx's 6-tile strip. Pure presentational —
// the parent fetches data; this only renders. No hooks → safe in RSC.

import { Sparkline } from './sparkline';

type Tone = 'default' | 'accent' | 'positive' | 'attention';

const TONE_VALUE: Record<Tone, string> = {
  default: 'text-zinc-900',
  accent: 'text-purple-700',
  positive: 'text-emerald-700',
  attention: 'text-amber-700',
};

const TONE_SPARK: Record<Tone, string> = {
  default: 'text-zinc-400',
  accent: 'text-purple-500',
  positive: 'text-emerald-500',
  attention: 'text-amber-500',
};

const TONE_BORDER: Record<Tone, string> = {
  default: 'border-zinc-200',
  accent: 'border-purple-200',
  positive: 'border-emerald-200',
  attention: 'border-amber-200',
};

export type KpiTileProps = {
  label: string;
  value: string;
  sub: string;
  tone?: Tone;
  /** 7-day series for the inline sparkline (optional). */
  trend?: number[];
  /** Pct delta vs prior period (optional). e.g. 0.12 → "+12% vs anterior". */
  deltaPct?: number | null;
};

export function KpiTile({
  label,
  value,
  sub,
  tone = 'default',
  trend,
  deltaPct,
}: KpiTileProps) {
  const showSpark = trend && trend.length > 1;
  const hasDelta = typeof deltaPct === 'number' && Number.isFinite(deltaPct);
  const positive = hasDelta && (deltaPct as number) > 0;
  const negative = hasDelta && (deltaPct as number) < 0;

  return (
    <div
      className={`group flex flex-col rounded-xl border bg-white p-4 transition-colors hover:border-zinc-300 sm:p-5 ${TONE_BORDER[tone]}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p
          className={`text-2xl font-semibold leading-none tabular-nums tracking-tight ${TONE_VALUE[tone]} sm:text-[26px]`}
        >
          {value}
        </p>
        {showSpark ? (
          <Sparkline
            points={trend}
            tone={TONE_SPARK[tone]}
            label={`Trend ${label.toLowerCase()} (7 zile)`}
          />
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-400">{sub}</p>
        {hasDelta ? (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${
              positive
                ? 'text-emerald-700'
                : negative
                  ? 'text-rose-700'
                  : 'text-zinc-500'
            }`}
            aria-label={`Variație față de perioada anterioară: ${
              positive ? '+' : ''
            }${Math.round((deltaPct as number) * 100)} la sută`}
          >
            <span aria-hidden>{positive ? '▲' : negative ? '▼' : '·'}</span>
            {Math.abs(Math.round((deltaPct as number) * 100))}%
          </span>
        ) : null}
      </div>
    </div>
  );
}
