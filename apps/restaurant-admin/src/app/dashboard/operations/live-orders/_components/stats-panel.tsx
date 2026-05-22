'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { DaySummary, ZoneDistribution } from '../page';

// Tailwind-compatible palette for zone slices.
const COLORS = [
  '#7c3aed', // violet-600
  '#2563eb', // blue-600
  '#16a34a', // green-600
  '#ca8a04', // yellow-600
  '#ea580c', // orange-600
  '#9f1239', // rose-800
];

type Props = {
  summary: DaySummary;
  zoneDistribution: ZoneDistribution[];
};

export function StatsPanel({ summary, zoneDistribution }: Props) {
  const totalZone = useMemo(
    () => zoneDistribution.reduce((s, z) => s + z.count, 0),
    [zoneDistribution],
  );

  return (
    <section
      aria-labelledby="stats-heading"
      className="rounded-xl border border-zinc-200 bg-white px-4 py-4"
    >
      <h2
        id="stats-heading"
        className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500"
      >
        Statistici
      </h2>

      {summary.avg_delivery_min !== null && (
        <div className="mb-3 rounded-lg bg-purple-50 px-3 py-2">
          <p className="text-[11px] text-purple-600 font-medium uppercase tracking-wide">Timp mediu livrare</p>
          <p className="text-xl font-bold text-purple-700 tabular-nums">
            {summary.avg_delivery_min} <span className="text-sm font-normal">min</span>
          </p>
        </div>
      )}

      {zoneDistribution.length > 0 ? (
        <>
          <p className="mb-1 text-[11px] font-medium text-zinc-400">Distributie pe zone</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={zoneDistribution}
                  dataKey="count"
                  nameKey="zone"
                  cx="50%"
                  cy="50%"
                  outerRadius={55}
                  innerRadius={28}
                  strokeWidth={1}
                >
                  {zoneDistribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, name: string) => [
                    `${v} (${totalZone > 0 ? Math.round((v / totalZone) * 100) : 0}%)`,
                    name,
                  ]}
                  contentStyle={{ borderRadius: 6, border: '1px solid #e4e4e7', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-2 flex flex-col gap-0.5" aria-label="Distributie pe zone">
            {zoneDistribution.map((z, i) => (
              <li key={z.zone} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-zinc-700 truncate max-w-[120px]" title={z.zone}>
                    {z.zone}
                  </span>
                </span>
                <span className="tabular-nums text-zinc-500">
                  {z.count} ({totalZone > 0 ? Math.round((z.count / totalZone) * 100) : 0}%)
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs text-zinc-400">Insuficiente date pentru distributia zonelor.</p>
      )}
    </section>
  );
}
