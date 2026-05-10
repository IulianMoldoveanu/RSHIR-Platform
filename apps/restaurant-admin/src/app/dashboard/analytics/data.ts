import 'server-only';
import { createServerClient } from '@/lib/supabase/server';
import type {
  AnalyticsData,
  DailyRow,
  TopItemRow,
  PeakRow,
  HeatmapPoint,
  ReviewRow,
  ReviewsBlock,
} from './types';

// Views are not in @hir/supabase-types yet; cast through `any` for table access.
// (Views inherit RLS via security_invoker = true, so the auth cookie still
// limits the result to the caller's tenant rows; we additionally filter by
// tenant_id to enforce single-tenant scope when the user is in many tenants.)
export async function loadAnalytics(tenantId: string): Promise<AnalyticsData> {
  const supabase = await createServerClient();
  const sb = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
    };
  };

  const [dailyRes, topRes, peakRes, heatRes, summaryRes, recentRes] = await Promise.all([
    sb.from('v_orders_daily').select('day, revenue, order_count, avg_value').eq('tenant_id', tenantId),
    sb.from('v_top_items').select('item_id, item_name, order_count, revenue').eq('tenant_id', tenantId),
    sb.from('v_peak_hours').select('dow, hour, order_count').eq('tenant_id', tenantId),
    sb.from('v_delivery_addresses_30d').select('lat, lng').eq('tenant_id', tenantId),
    // RSHIR-41: surface RSHIR-39 reviews in the analytics dashboard. Aggregate
    // first; recent rows go through RLS scoped by tenant_member.
    sb.from('restaurant_review_summary').select('review_count, average_rating').eq('tenant_id', tenantId),
    supabase
      .from('restaurant_reviews')
      .select('id, rating, comment, created_at')
      .eq('tenant_id', tenantId)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const daily = ((dailyRes.data ?? []) as Array<{ day: string; revenue: number | string; order_count: number | string; avg_value: number | string }>)
    .map((r) => ({
      day: r.day,
      revenue: Number(r.revenue),
      order_count: Number(r.order_count),
      avg_value: Number(r.avg_value),
    }))
    .sort((a, b) => a.day.localeCompare(b.day)) as DailyRow[];

  const topItems = ((topRes.data ?? []) as Array<{ item_id: string; item_name: string; order_count: number | string; revenue: number | string }>)
    .map((r) => ({
      item_id: r.item_id,
      item_name: r.item_name,
      order_count: Number(r.order_count),
      revenue: Number(r.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue) as TopItemRow[];

  const peakHours = ((peakRes.data ?? []) as Array<{ dow: number | string; hour: number | string; order_count: number | string }>)
    .map((r) => ({
      dow: Number(r.dow),
      hour: Number(r.hour),
      order_count: Number(r.order_count),
    })) as PeakRow[];

  const heatmap = ((heatRes.data ?? []) as Array<{ lat: number | string; lng: number | string }>)
    .map((r) => ({ lat: Number(r.lat), lng: Number(r.lng) })) as HeatmapPoint[];

  // KPIs: derive from daily rows (already tenant-scoped, last-30-day window
  // is the natural reach of v_orders_daily once orders age out — but the view
  // does NOT cap at 30 days, so we filter here).
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayKey = today.toISOString().slice(0, 10);
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const monthStart = new Date(today);
  monthStart.setUTCDate(monthStart.getUTCDate() - 29);
  // QW10 (UIUX audit 2026-05-08): keep up to 90 days of daily rows so the
  // client-side range presets (7 / 30 / 90) can re-slice without a server
  // round-trip. KPI cards still fix on 30-day windows for the "Venit lună"
  // headline; charts are now client-controlled.
  const ninetyStart = new Date(today);
  ninetyStart.setUTCDate(ninetyStart.getUTCDate() - 89);

  const todayRevenue = daily.find((d) => d.day === todayKey)?.revenue ?? 0;
  const weekRevenue = daily
    .filter((d) => new Date(d.day) >= weekStart)
    .reduce((s, d) => s + d.revenue, 0);
  const last30 = daily.filter((d) => new Date(d.day) >= monthStart);
  const last90 = daily.filter((d) => new Date(d.day) >= ninetyStart);
  const monthRevenue = last30.reduce((s, d) => s + d.revenue, 0);
  const monthOrders = last30.reduce((s, d) => s + d.order_count, 0);
  const avgOrderValue30d = monthOrders === 0 ? 0 : monthRevenue / monthOrders;

  const summaryRow = ((summaryRes.data ?? []) as Array<{ review_count: number | string; average_rating: number | string }>)[0];
  const recentRows = ((recentRes.data ?? []) as Array<ReviewRow>);
  const reviews: ReviewsBlock = {
    count: summaryRow ? Number(summaryRow.review_count) : 0,
    average: summaryRow ? Number(summaryRow.average_rating) : 0,
    recent: recentRows,
  };

  return {
    kpis: {
      todayRevenue,
      weekRevenue,
      monthRevenue,
      avgOrderValue30d,
    },
    // QW10 — return up to 90 days; client filters by range preset. Charts
    // narrow to 7 / 30 / 90 day slices via `<RangePresets>` in the client.
    daily: last90,
    topItems,
    peakHours,
    heatmap,
    reviews,
  };
}
