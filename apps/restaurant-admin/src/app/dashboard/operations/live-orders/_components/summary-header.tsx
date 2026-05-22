'use client';

import type { DaySummary } from '../page';

function DeltaBadge({ current, yesterday }: { current: number; yesterday: number | null }) {
  if (yesterday === null || yesterday === 0) return null;
  const pct = Math.round(((current - yesterday) / yesterday) * 100);
  if (pct === 0) return null;
  const positive = pct > 0;
  return (
    <span
      aria-label={`${positive ? '+' : ''}${pct}% fata de ieri`}
      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        positive
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-rose-100 text-rose-700'
      }`}
    >
      {positive ? '+' : ''}{pct}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  yesterday,
  colorClass,
}: {
  label: string;
  value: number | string;
  yesterday: number | null;
  colorClass: string;
}) {
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <p className={`text-2xl font-bold tabular-nums ${colorClass}`}>{value}</p>
        {typeof value === 'number' && (
          <DeltaBadge current={value} yesterday={yesterday} />
        )}
      </div>
    </div>
  );
}

type Props = {
  summary: DaySummary;
  yesterdaySummary: DaySummary | null;
};

export function SummaryHeader({ summary, yesterdaySummary }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      <KpiCard
        label="Comenzi total"
        value={summary.total}
        yesterday={yesterdaySummary?.total ?? null}
        colorClass="text-zinc-900"
      />
      <KpiCard
        label="In curs"
        value={summary.active}
        yesterday={yesterdaySummary?.active ?? null}
        colorClass="text-orange-600"
      />
      <KpiCard
        label="Livrate"
        value={summary.delivered}
        yesterday={yesterdaySummary?.delivered ?? null}
        colorClass="text-emerald-700"
      />
      <KpiCard
        label="Anulate"
        value={summary.cancelled}
        yesterday={yesterdaySummary?.cancelled ?? null}
        colorClass="text-rose-600"
      />
      {summary.avg_delivery_min !== null && (
        <KpiCard
          label="Timp mediu livrare"
          value={`${summary.avg_delivery_min} min`}
          yesterday={null}
          colorClass="text-purple-700"
        />
      )}
    </div>
  );
}
