// demand-forecast.ts — pure algorithm extracted for server and test use.
//
// This module mirrors the core of the Edge Function but lives inside the
// Next.js app so the dashboard widget can run the same computation in
// unit tests (vitest) without Deno imports.
//
// IMPORTANT: keep this in sync with
//   supabase/functions/demand-forecast-daily/index.ts#computeForecastCells
// Both must produce identical output given identical inputs.

export type OrderTimestamp = {
  created_at: string; // ISO-8601 UTC
};

export type BucketStats = {
  day_of_week: number; // 0 = Sunday … 6 = Saturday
  hour_of_day: number; // 0-23
  mean_count: number;
  std_count: number;
  trend_ratio: number;
  forecast_count: number;
  ci_lower: number;
  ci_upper: number;
  sample_weeks: number;
};

/**
 * Given raw order timestamps for one tenant (UTC ISO strings), compute
 * per-(day_of_week, hour_of_day) forecast statistics.
 *
 * @param orders     - Array of objects with `created_at` UTC strings
 * @param referenceNow - Anchor point (usually new Date()); treated as "now"
 * @param maxWeeks   - Look-back window in weeks (default 8)
 */
export function computeForecastCells(
  orders: OrderTimestamp[],
  referenceNow: Date,
  maxWeeks = 8,
): BucketStats[] {
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const windowStart = new Date(referenceNow.getTime() - maxWeeks * MS_PER_WEEK);

  // bucketWeekly[dow][hour][weekIndex] = count
  const bucketWeekly: number[][][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => new Array(maxWeeks).fill(0)),
  );

  let actualWeeks = 0;

  for (const order of orders) {
    const ts = new Date(order.created_at);
    if (ts < windowStart || ts >= referenceNow) continue;

    const dow = ts.getUTCDay();
    const hour = ts.getUTCHours();
    const weekIndex = Math.floor(
      (referenceNow.getTime() - ts.getTime()) / MS_PER_WEEK,
    );
    if (weekIndex >= maxWeeks) continue;

    bucketWeekly[dow][hour][weekIndex] += 1;
    actualWeeks = Math.max(actualWeeks, weekIndex + 1);
  }

  const results: BucketStats[] = [];

  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const weeklyCounts = bucketWeekly[dow][hour].slice(0, actualWeeks);
      if (weeklyCounts.every((c) => c === 0)) continue;

      const n = weeklyCounts.length;
      const mean = weeklyCounts.reduce((s, v) => s + v, 0) / n;

      const variance =
        n > 1
          ? weeklyCounts.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
          : 0;
      const std = Math.sqrt(variance);

      let trendRatio = 1.0;
      if (n >= 3) {
        const recentCount = Math.min(2, n);
        const recentAvg =
          weeklyCounts.slice(0, recentCount).reduce((s, v) => s + v, 0) /
          recentCount;
        const olderSlice = weeklyCounts.slice(2);
        if (olderSlice.length > 0) {
          const olderAvg =
            olderSlice.reduce((s, v) => s + v, 0) / olderSlice.length;
          if (olderAvg > 0) {
            trendRatio = Math.min(2.0, Math.max(0.5, recentAvg / olderAvg));
          }
        }
      }

      const forecast = mean * trendRatio;
      const ciHalf = n > 0 ? 1.96 * (std / Math.sqrt(n)) : 0;

      results.push({
        day_of_week: dow,
        hour_of_day: hour,
        mean_count: r2(mean),
        std_count: r2(std),
        trend_ratio: r4(trendRatio),
        forecast_count: r2(forecast),
        ci_lower: r2(Math.max(0, mean - ciHalf)),
        ci_upper: r2(mean + ciHalf),
        sample_weeks: actualWeeks,
      });
    }
  }

  return results;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
