// HIR — Demand Forecast Daily Edge Function
//
// Fires daily at 04:00 UTC (pg_cron). For each ACTIVE tenant, aggregates
// `restaurant_orders` over the last 8 weeks, computes per-(day_of_week,
// hour_of_day) statistics, and upserts into `demand_forecast_cells`.
//
// Algorithm (pure stats — no ML):
//   mean     = avg orders in bucket over available weeks
//   std      = sample standard deviation
//   trend    = avg(last 2 weeks) / avg(weeks 3-8) — clamped to [0.5, 2.0]
//   forecast = mean × trend_ratio
//   95% CI   = mean ± 1.96 × (std / sqrt(n))
//
// Cold-start: sample_weeks < 4 → cells written with sample_weeks flag;
// the dashboard widget renders a message instead of the heatmap.
//
// Auth: `x-hir-notify-secret` header (same secret as other cron functions).
//
// Required secrets (auto-injected by Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Required secrets (set via vault / dashboard):
//   HIR_NOTIFY_SECRET   shared cron secret

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderRow = {
  created_at: string; // ISO-8601 UTC
};

type BucketStats = {
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

// ─── Core computation (pure, exported for tests) ──────────────────────────────

/**
 * Given raw order timestamps for one tenant (UTC strings), compute per-bucket
 * stats over the last `maxWeeks` weeks anchored to `referenceNow`.
 *
 * Returns one BucketStats per (day_of_week, hour_of_day) bucket that has at
 * least one order in the window. Buckets with zero orders across all weeks are
 * omitted — the dashboard treats missing cells as forecast = 0.
 */
export function computeForecastCells(
  orders: OrderRow[],
  referenceNow: Date,
  maxWeeks = 8,
): BucketStats[] {
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const windowStart = new Date(referenceNow.getTime() - maxWeeks * MS_PER_WEEK);

  // Bucket weekly counts: bucketWeekly[dow][hour][weekIndex] = count
  // weekIndex 0 = most recent complete week, 7 = oldest.
  const bucketWeekly: number[][][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => new Array(maxWeeks).fill(0)),
  );

  let actualWeeks = 0;

  for (const order of orders) {
    const ts = new Date(order.created_at);
    if (ts < windowStart || ts >= referenceNow) continue;

    const dow = ts.getUTCDay(); // 0=Sun … 6=Sat
    const hour = ts.getUTCHours();

    // Which week back? 0 = [now-1w, now), 1 = [now-2w, now-1w), etc.
    const weekIndex = Math.floor(
      (referenceNow.getTime() - ts.getTime()) / MS_PER_WEEK,
    );
    if (weekIndex >= maxWeeks) continue;

    bucketWeekly[dow][hour][weekIndex] += 1;
    actualWeeks = Math.max(actualWeeks, weekIndex + 1);
  }

  // Build per-bucket stats.
  const results: BucketStats[] = [];

  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const weeklyCounts = bucketWeekly[dow][hour].slice(0, actualWeeks);

      // Skip entirely empty buckets.
      if (weeklyCounts.every((c) => c === 0)) continue;

      const n = weeklyCounts.length;
      const mean = weeklyCounts.reduce((s, v) => s + v, 0) / n;

      // Sample standard deviation (Bessel's correction, n-1).
      const variance =
        n > 1
          ? weeklyCounts.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
          : 0;
      const std = Math.sqrt(variance);

      // Trend: ratio of last-2-weeks avg to weeks-3-8 avg.
      // recent = indices 0, 1 (0 = most recent week)
      // older  = indices 2..n-1
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
            // Clamp to [0.5, 2.0] to avoid absurd extrapolations.
            trendRatio = Math.min(2.0, Math.max(0.5, recentAvg / olderAvg));
          }
        }
      }

      const forecast = mean * trendRatio;

      // 95% CI: mean ± 1.96 × std / sqrt(n)
      const ciHalf = n > 0 ? 1.96 * (std / Math.sqrt(n)) : 0;

      results.push({
        day_of_week: dow,
        hour_of_day: hour,
        mean_count: round2(mean),
        std_count: round2(std),
        trend_ratio: round4(trendRatio),
        forecast_count: round2(forecast),
        ci_lower: round2(Math.max(0, mean - ciHalf)),
        ci_upper: round2(mean + ciHalf),
        sample_weeks: actualWeeks,
      });
    }
  }

  return results;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ─── Edge Function handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return json(200, { ok: true, service: 'demand-forecast-daily' });
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  return withRunLog('demand-forecast-daily', async ({ setMetadata }) => {
    const expected = Deno.env.get('HIR_NOTIFY_SECRET');
    if (!expected) return json(500, { error: 'notify_secret_missing' });
    const got = req.headers.get('x-hir-notify-secret') ?? '';
    if (got !== expected) return json(401, { error: 'unauthorized' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // deno-lint-ignore no-explicit-any
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as any;

    // Optional: single-tenant mode for re-runs / backfills.
    let body: { tenant_id?: string } = {};
    try {
      body = (await req.json()) as { tenant_id?: string };
    } catch {
      body = {};
    }

    // Fetch active tenants.
    const tenantQuery = supabase
      .from('tenants')
      .select('id, slug')
      .eq('status', 'active');
    const { data: tenantData, error: tenantErr } = body.tenant_id
      ? await tenantQuery.eq('id', body.tenant_id)
      : await tenantQuery;

    if (tenantErr) {
      return json(500, { error: 'tenants_fetch_failed', detail: tenantErr.message });
    }
    const tenants = (tenantData ?? []) as Array<{ id: string; slug: string }>;

    const now = new Date();
    const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);

    let tenantsProcessed = 0;
    let cellsUpserted = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        // Fetch raw order timestamps for this tenant over the last 8 weeks.
        const { data: orderData, error: orderErr } = await supabase
          .from('restaurant_orders')
          .select('created_at')
          .eq('tenant_id', tenant.id)
          .neq('status', 'CANCELLED')
          .gte('created_at', eightWeeksAgo.toISOString());

        if (orderErr) {
          console.error(
            `[demand-forecast] orders fetch failed for ${tenant.slug}:`,
            orderErr.message,
          );
          errors += 1;
          continue;
        }

        const orders = (orderData ?? []) as OrderRow[];
        const cells = computeForecastCells(orders, now, 8);

        if (cells.length === 0) {
          // Tenant has no orders in window — nothing to upsert.
          tenantsProcessed += 1;
          continue;
        }

        const rows = cells.map((c) => ({
          tenant_id: tenant.id,
          day_of_week: c.day_of_week,
          hour_of_day: c.hour_of_day,
          forecast_count: c.forecast_count,
          mean_count: c.mean_count,
          std_count: c.std_count,
          trend_ratio: c.trend_ratio,
          ci_lower: c.ci_lower,
          ci_upper: c.ci_upper,
          sample_weeks: c.sample_weeks,
          computed_at: now.toISOString(),
        }));

        const { error: upsertErr } = await supabase
          .from('demand_forecast_cells')
          .upsert(rows, {
            onConflict: 'tenant_id,day_of_week,hour_of_day',
            ignoreDuplicates: false,
          });

        if (upsertErr) {
          console.error(
            `[demand-forecast] upsert failed for ${tenant.slug}:`,
            upsertErr.message,
          );
          errors += 1;
          continue;
        }

        cellsUpserted += rows.length;
        tenantsProcessed += 1;
      } catch (e) {
        console.error(
          `[demand-forecast] unhandled error for ${tenant.slug}:`,
          (e as Error).message,
        );
        errors += 1;
      }
    }

    setMetadata({
      tenants_processed: tenantsProcessed,
      cells_upserted: cellsUpserted,
      errors,
    });

    return json(200, {
      ok: true,
      tenants_processed: tenantsProcessed,
      cells_upserted: cellsUpserted,
      errors,
    });
  });
});
