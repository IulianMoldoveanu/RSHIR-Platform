'use client';

import dynamic from 'next/dynamic';
import { Button, EmptyState } from '@hir/ui';
import type { AnalyticsData, DailyRow, TopItemRow, PeakRow, ReviewsBlock } from './types';

const HeatmapMap = dynamic(() => import('./heatmap-map').then((m) => m.HeatmapMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
      Se încarcă harta…
    </div>
  ),
});

// recharts is heavy and only used in two below-the-fold chart blocks. Defer
// the entire recharts module + the chart components into a separate chunk
// that loads after the KPI grid renders. ssr:false because recharts uses
// `ResponsiveContainer`'s ResizeObserver path which already runs on the
// client only — no SEO/critical-render impact.
const ChartLoading = () => (
  <div className="flex h-[260px] items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
    Se încarcă graficul…
  </div>
);
const RevenueLineChart = dynamic(
  () => import('./analytics-charts').then((m) => m.RevenueLineChart),
  { ssr: false, loading: ChartLoading },
);
const TopItemsBarChart = dynamic(
  () => import('./analytics-charts').then((m) => m.TopItemsBarChart),
  { ssr: false, loading: ChartLoading },
);

const RON = (v: number) => `${v.toFixed(2)} RON`;

function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function ChartCard({
  title,
  onExport,
  empty,
  children,
}: {
  title: string;
  onExport?: () => void;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
        {onExport ? (
          <Button type="button" variant="outline" size="sm" onClick={onExport} disabled={empty}>
            Export CSV
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

const DOW_LABELS = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

function PeakHoursHeatmap({ rows }: { rows: PeakRow[] }) {
  // Build a 7x24 grid; dow 0 = Sunday.
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const r of rows) {
    if (r.dow >= 0 && r.dow < 7 && r.hour >= 0 && r.hour < 24) {
      grid[r.dow][r.hour] = r.order_count;
      if (r.order_count > max) max = r.order_count;
    }
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="px-1 py-1" />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="px-1 py-1 font-normal text-zinc-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, dow) => (
            <tr key={dow}>
              <td className="px-2 py-1 font-medium text-zinc-700">{DOW_LABELS[dow]}</td>
              {row.map((count, h) => {
                const intensity = max === 0 ? 0 : count / max;
                const bg =
                  intensity === 0
                    ? 'rgb(244,244,245)'
                    : `rgba(124,58,237,${0.15 + intensity * 0.85})`;
                return (
                  <td
                    key={h}
                    className="border border-white"
                    style={{ background: bg, width: 22, height: 22 }}
                    title={`${DOW_LABELS[dow]} ${h}:00 — ${count} comenzi`}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  // Render 5 outlined stars filled up to `value` (rounded to nearest 0.5).
  const v = Math.max(0, Math.min(5, value));
  const full = Math.floor(v);
  const half = v - full >= 0.25 && v - full < 0.75;
  const fullCount = half ? full : Math.round(v);
  const halfFlag = half ? 1 : 0;
  return (
    <span className="text-amber-500" aria-hidden>
      {'★'.repeat(fullCount)}
      {halfFlag ? '⯨' : ''}
      {'☆'.repeat(5 - fullCount - halfFlag)}
    </span>
  );
}

function ReviewsCard({ reviews }: { reviews: ReviewsBlock }) {
  return (
    <ChartCard title="Recenzii clienți (toată perioada)" empty={reviews.count === 0}>
      {reviews.count === 0 ? (
        <EmptyState
          title="Nicio recenzie încă"
          description="Recenziile apar după ce un client lasă o notă pe pagina de tracking a comenzii livrate."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-zinc-900">
              {reviews.average.toFixed(1)}
            </span>
            <Stars value={reviews.average} />
            <span className="text-sm text-zinc-500">
              {reviews.count} {reviews.count === 1 ? 'recenzie' : 'recenzii'}
            </span>
          </div>
          {reviews.recent.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {reviews.recent.map((r) => (
                <li key={r.id} className="rounded border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center justify-between">
                    <Stars value={r.rating} />
                    <span className="text-xs text-zinc-500">
                      {new Date(r.created_at).toLocaleDateString('ro-RO')}
                    </span>
                  </div>
                  {r.comment ? (
                    <p className="mt-1 whitespace-pre-wrap text-zinc-700">{r.comment}</p>
                  ) : (
                    <p className="mt-1 italic text-zinc-400">(fără comentariu)</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ChartCard>
  );
}

type Props = {
  data: AnalyticsData;
  hasOrders: boolean;
};

export function AnalyticsClient({ data, hasOrders }: Props) {
  const { kpis, daily, topItems, peakHours, heatmap, reviews } = data;

  return (
    <div className="flex flex-col gap-4">
      {!hasOrders ? (
        <EmptyState
          title="Nicio comandă încă"
          description="Cardurile de mai jos vor afișa cifre reale imediat ce încep să apară comenzi. Până atunci, pune-ți meniul la punct și definește zonele de livrare."
          hint="Tip: import-ul masiv din /menu și desenarea zonelor în /zones se pot face acum."
        />
      ) : null}

      {/* KPI grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Venit azi" value={RON(kpis.todayRevenue)} />
        <KpiCard label="Venit săptămână" value={RON(kpis.weekRevenue)} />
        <KpiCard label="Venit 30 zile" value={RON(kpis.monthRevenue)} />
        <KpiCard label="Valoare medie comandă (30z)" value={RON(kpis.avgOrderValue30d)} />
      </div>

      {/* Daily revenue */}
      <ChartCard
        title="Venit zilnic (ultimele 30 zile)"
        empty={daily.length === 0}
        onExport={() =>
          downloadCsv(
            'venit-zilnic.csv',
            daily.map((d: DailyRow) => ({
              day: d.day,
              revenue: d.revenue.toFixed(2),
              order_count: d.order_count,
              avg_value: d.avg_value.toFixed(2),
            })),
          )
        }
      >
        {daily.length === 0 ? (
          <EmptyState
            title="Niciun venit înregistrat"
            description="Graficul va apărea după prima comandă plătită."
          />
        ) : (
          <RevenueLineChart daily={daily} />
        )}
      </ChartCard>

      {/* Top items + Peak hours side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top 10 produse (30z)"
          empty={topItems.length === 0}
          onExport={() =>
            downloadCsv(
              'top-produse.csv',
              topItems.map((t: TopItemRow) => ({
                item_id: t.item_id,
                item_name: t.item_name,
                order_count: t.order_count,
                revenue: t.revenue.toFixed(2),
              })),
            )
          }
        >
          {topItems.length === 0 ? (
            <EmptyState
              title="Niciun produs vândut"
              description="Topul va apărea după ce produsele tale apar în comenzi."
            />
          ) : (
            <TopItemsBarChart topItems={topItems} />
          )}
        </ChartCard>

        <ChartCard
          title="Heatmap ore de vârf (30z)"
          empty={peakHours.length === 0}
          onExport={() =>
            downloadCsv(
              'ore-de-varf.csv',
              peakHours.map((p) => ({
                dow: p.dow,
                hour: p.hour,
                order_count: p.order_count,
              })),
            )
          }
        >
          {peakHours.length === 0 ? (
            <EmptyState
              title="Date insuficiente"
              description="Heatmap-ul va apărea după primele comenzi."
            />
          ) : (
            <PeakHoursHeatmap rows={peakHours} />
          )}
        </ChartCard>
      </div>

      {/* Geographic heatmap */}
      <ChartCard
        title="Distribuție geografică livrări (90z)"
        empty={heatmap.length === 0}
        onExport={() =>
          downloadCsv(
            'livrari-coordonate.csv',
            heatmap.map((p) => ({ lat: p.lat, lng: p.lng })),
          )
        }
      >
        {heatmap.length === 0 ? (
          <EmptyState
            title="Nicio livrare cu coordonate"
            description="Adresele clienților trebuie să aibă lat/lng (geocodate la checkout) pentru a apărea aici."
          />
        ) : (
          <HeatmapMap points={heatmap} />
        )}
      </ChartCard>

      {/* Reviews from RSHIR-39 */}
      <ReviewsCard reviews={reviews} />

      {/* Conversion rate placeholder */}
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-800">Rata de conversie</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Necesită tracking page-view pe storefront — implementare în Phase 2.
        </p>
      </div>
    </div>
  );
}
