import { TrendingUp } from 'lucide-react';

type Props = {
  /** Today's delivered orders (fee + timestamp). */
  todayRows: Array<{ delivery_fee_ron: number | null; updated_at: string }>;
  /** Last 7 days of delivered orders (excluding today), newest first. */
  trailing7Rows: Array<{ delivery_fee_ron: number | null; updated_at: string }>;
};

type Projection = {
  todayEarnings: number;
  todayCount: number;
  avgDailyEarnings: number;
  avgDailyCount: number;
  delta: number; // positive = above average
};

function computeProjection(todayRows: Props['todayRows'], trailing7Rows: Props['trailing7Rows']): Projection {
  const todayEarnings = todayRows.reduce((s, r) => s + (Number(r.delivery_fee_ron) || 0), 0);
  const todayCount = todayRows.length;

  // Trailing 7 days: group by calendar day, then average.
  const byDay = new Map<string, number>();
  for (const r of trailing7Rows) {
    const d = new Date(r.updated_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDay.set(key, (byDay.get(key) ?? 0) + (Number(r.delivery_fee_ron) || 0));
  }

  // Use count of distinct days that had at least one delivery (min 1 to avoid /0).
  const activeDays = byDay.size;
  const totalTrailingEarnings = [...byDay.values()].reduce((s, v) => s + v, 0);

  // Average: if no trailing data, use 0 — card will be silent below.
  const avgDailyEarnings = activeDays > 0 ? totalTrailingEarnings / activeDays : 0;

  // Average deliveries per active day — for "X more deliveries" copy.
  const trailingCountByDay = new Map<string, number>();
  for (const r of trailing7Rows) {
    const d = new Date(r.updated_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    trailingCountByDay.set(key, (trailingCountByDay.get(key) ?? 0) + 1);
  }
  const totalTrailingCount = [...trailingCountByDay.values()].reduce((s, v) => s + v, 0);
  const avgDailyCount = activeDays > 0 ? totalTrailingCount / activeDays : 0;

  return {
    todayEarnings,
    todayCount,
    avgDailyEarnings,
    avgDailyCount,
    delta: todayEarnings - avgDailyEarnings,
  };
}

export function ProjectionCard({ todayRows, trailing7Rows }: Props) {
  const proj = computeProjection(todayRows, trailing7Rows);

  // No trailing data and no today data — nothing meaningful to show.
  if (proj.avgDailyEarnings === 0 && proj.todayEarnings === 0) return null;

  // If trailing data exists but today is still early, show projected gap.
  const isAbove = proj.delta >= 0;

  // Estimate remaining deliveries needed to reach avg.
  // avgFeePerDelivery from trailing data; fallback to 1 to avoid /0.
  const avgFeePerDelivery =
    proj.avgDailyCount > 0 ? proj.avgDailyEarnings / proj.avgDailyCount : 0;
  const remaining =
    !isAbove && avgFeePerDelivery > 0
      ? Math.ceil(Math.abs(proj.delta) / avgFeePerDelivery)
      : 0;

  return (
    <section
      aria-label="Proiecție față de media zilnică"
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
        isAbove
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-hir-border bg-hir-surface'
      }`}
    >
      <TrendingUp
        className={`h-5 w-5 shrink-0 ${isAbove ? 'text-emerald-400' : 'text-hir-muted-fg'}`}
        aria-hidden
      />
      <div className="flex-1 text-sm">
        {isAbove ? (
          <>
            <p className="font-medium text-hir-fg">Ești peste media zilnică</p>
            <p className="mt-0.5 text-xs text-hir-muted-fg">
              +{proj.delta.toFixed(2)} RON față de media din ultimele 7 zile (
              {proj.avgDailyEarnings.toFixed(2)} RON/zi)
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-hir-fg">
              {remaining > 0
                ? `Mai ai ${remaining} ${remaining === 1 ? 'livrare' : 'livrări'} pentru a-ți atinge media zilnică`
                : `Mai ai ${Math.abs(proj.delta).toFixed(2)} RON pentru media zilnică`}
            </p>
            <p className="mt-0.5 text-xs text-hir-muted-fg">
              Media ta din ultimele 7 zile: {proj.avgDailyEarnings.toFixed(2)} RON/zi
            </p>
          </>
        )}
      </div>
    </section>
  );
}
