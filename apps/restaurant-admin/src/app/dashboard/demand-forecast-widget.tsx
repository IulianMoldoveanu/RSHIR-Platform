// Demand Forecast Widget — 7×24 hourly heatmap for the patron's dashboard.
//
// Reads `demand_forecast_cells` for the active tenant and renders:
//   1. A 7-day × 24-hour colour-intensity heatmap (Tailwind grid, no charting lib).
//   2. Top-3 "hot moment" callouts with staffing hints.
//   3. Top-3 "quiet slot" callouts as promo-flash opportunities.
//
// Cold-start: if the tenant has fewer than 4 weeks of data (sample_weeks < 4)
// the heatmap shows an empty grid with a "Predictions available after 4 weeks"
// message instead.
//
// Server component — no client JS needed.

import { TrendingUp } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

// Day labels in Romanian (0=Sun … 6=Sat), shown as Mon→Sun for UX.
const DAY_LABELS = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];

// Map JS getUTCDay() order (0=Sun) to display order Mon–Sun (0=Mon index).
// displayDow[displayIndex] = utcDow
const DISPLAY_ORDER: number[] = [1, 2, 3, 4, 5, 6, 0]; // Mon Tue Wed Thu Fri Sat Sun

type ForecastCell = {
  day_of_week: number;
  hour_of_day: number;
  forecast_count: number;
  mean_count: number;
  std_count: number;
  sample_weeks: number;
};

type Props = {
  tenantId: string;
};

async function loadCells(tenantId: string): Promise<ForecastCell[]> {
  const admin = createAdminClient();
  // demand_forecast_cells not in generated types yet — cast through any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('demand_forecast_cells')
    .select(
      'day_of_week, hour_of_day, forecast_count, mean_count, std_count, sample_weeks',
    )
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[demand-forecast-widget] fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as ForecastCell[];
}

/** Tailwind bg class for a 0–1 intensity value. */
function intensityClass(intensity: number): string {
  if (intensity <= 0) return 'bg-zinc-50';
  if (intensity < 0.15) return 'bg-indigo-100';
  if (intensity < 0.3) return 'bg-indigo-200';
  if (intensity < 0.45) return 'bg-indigo-300';
  if (intensity < 0.6) return 'bg-indigo-400';
  if (intensity < 0.75) return 'bg-indigo-500';
  if (intensity < 0.9) return 'bg-indigo-600';
  return 'bg-indigo-700';
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function couriersHint(forecast: number): string {
  if (forecast >= 60) return '3+ curieri';
  if (forecast >= 30) return '2 curieri';
  return '1 curier';
}

export async function DemandForecastWidget({ tenantId }: Props) {
  const cells = await loadCells(tenantId);

  if (cells.length === 0) return null;

  // Check cold-start: if ANY cell has sample_weeks < 4, treat entire tenant
  // as cold-start (consistent message — all cells are from the same run).
  const minSampleWeeks = Math.min(...cells.map((c) => c.sample_weeks));
  const isColdStart = minSampleWeeks < 4;

  // Build a lookup map: cellMap[dow][hour] = forecast_count
  const cellMap: Record<number, Record<number, ForecastCell>> = {};
  for (const cell of cells) {
    if (!cellMap[cell.day_of_week]) cellMap[cell.day_of_week] = {};
    cellMap[cell.day_of_week][cell.hour_of_day] = cell;
  }

  const maxForecast = Math.max(...cells.map((c) => c.forecast_count), 1);

  // Identify "hot moments": forecast > mean + 1.5 × std
  const hotMoments = cells
    .filter((c) => c.forecast_count > c.mean_count + 1.5 * c.std_count)
    .sort((a, b) => b.forecast_count - a.forecast_count)
    .slice(0, 3);

  // Identify "quiet slots": forecast < mean - 0.5 × std AND mean > 1
  const quietSlots = cells
    .filter(
      (c) => c.mean_count > 1 && c.forecast_count < c.mean_count - 0.5 * c.std_count,
    )
    .sort((a, b) => a.forecast_count - b.forecast_count)
    .slice(0, 3);

  // Hours displayed: 6:00–23:00 to avoid an unreadable 24-column grid on
  // mobile. Operators mostly care about service hours.
  const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

  const dayName = (utcDow: number): string => {
    const dayMap: Record<number, string> = {
      1: 'Luni',
      2: 'Marți',
      3: 'Miercuri',
      4: 'Joi',
      5: 'Vineri',
      6: 'Sâmbătă',
      0: 'Duminică',
    };
    return dayMap[utcDow] ?? '—';
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-zinc-500" aria-hidden="true" />
        <h2 className="text-sm font-medium text-zinc-900">Prognoză comenzi — 7 zile</h2>
      </div>

      {isColdStart ? (
        <p className="mt-3 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-3 text-xs text-zinc-600">
          Predicțiile devin disponibile după <span className="font-medium">4 săptămâni</span> de
          date. Revino mai târziu.
        </p>
      ) : (
        <>
          {/* ── Heatmap ──────────────────────────────────────────────────── */}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[10px]" aria-label="Heatmap prognoze comenzi">
              <thead>
                <tr>
                  <th className="w-8 pr-1 text-right font-normal text-zinc-400" scope="col" />
                  {DISPLAY_ORDER.map((utcDow, idx) => (
                    <th
                      key={idx}
                      className="w-8 pb-1 text-center font-medium text-zinc-500"
                      scope="col"
                    >
                      {DAY_LABELS[idx]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((hour) => (
                  <tr key={hour}>
                    <td className="pr-1 text-right text-zinc-400">
                      {String(hour).padStart(2, '0')}
                    </td>
                    {DISPLAY_ORDER.map((utcDow, idx) => {
                      const cell = cellMap[utcDow]?.[hour];
                      const count = cell?.forecast_count ?? 0;
                      const intensity = count / maxForecast;
                      const bg = intensityClass(intensity);
                      const isHot =
                        cell &&
                        cell.forecast_count > cell.mean_count + 1.5 * cell.std_count;
                      return (
                        <td
                          key={idx}
                          className={`h-4 w-8 rounded-sm ${bg} ${isHot ? 'ring-1 ring-indigo-400 ring-offset-0' : ''}`}
                          title={
                            count > 0
                              ? `${dayName(utcDow)} ${formatHour(hour)}: ~${count.toFixed(0)} comenzi`
                              : undefined
                          }
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Legend ───────────────────────────────────────────────────── */}
          <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
            <span>Volum:</span>
            {['bg-indigo-100', 'bg-indigo-300', 'bg-indigo-500', 'bg-indigo-700'].map((bg) => (
              <span key={bg} className={`inline-block h-2.5 w-4 rounded-sm ${bg}`} />
            ))}
            <span>mic → mare</span>
          </div>

          {/* ── Hot Moments ──────────────────────────────────────────────── */}
          {hotMoments.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Momente de vârf
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {hotMoments.map((c, i) => {
                  const pctAbove =
                    c.mean_count > 0
                      ? Math.round(
                          ((c.forecast_count - c.mean_count) / c.mean_count) * 100,
                        )
                      : 0;
                  return (
                    <li
                      key={i}
                      className="rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900"
                    >
                      <span className="font-medium">
                        {dayName(c.day_of_week)} {formatHour(c.hour_of_day)}
                      </span>
                      {' — '}estimat{' '}
                      <span className="font-semibold tabular-nums">
                        ~{Math.round(c.forecast_count)} comenzi
                      </span>
                      {pctAbove > 0 && (
                        <span className="ml-1 text-indigo-700">
                          (+{pctAbove}% peste medie).
                        </span>
                      )}{' '}
                      Pregătește{' '}
                      <span className="font-medium">{couriersHint(c.forecast_count)}</span>.
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ── Quiet Slots ──────────────────────────────────────────────── */}
          {quietSlots.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Oportunități promo
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {quietSlots.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                  >
                    <span className="font-medium">
                      {dayName(c.day_of_week)} {formatHour(c.hour_of_day)}
                    </span>
                    {' — '}istoric slab (~
                    <span className="font-semibold tabular-nums">
                      {Math.round(c.forecast_count)} comenzi
                    </span>
                    ). Oportunitate de{' '}
                    <span className="font-medium">promo flash</span>.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
