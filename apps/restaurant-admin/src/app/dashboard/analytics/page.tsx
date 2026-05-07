import { getActiveTenant } from '@/lib/tenant';
import { loadAnalytics } from './data';
import { AnalyticsClient } from './analytics-client';

export const revalidate = 300; // 5 min cache.

// QW10 — accepts `?range=7|30|90` to seed the client's preset selection
// from the URL on first render. Anything else falls back to 30. The client
// keeps the URL in sync via history.replaceState so back/refresh works.
function parseRange(value: string | string[] | undefined): 7 | 30 | 90 {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === '7') return 7;
  if (v === '90') return 90;
  return 30;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
  const { tenant } = await getActiveTenant();
  const data = await loadAnalytics(tenant.id);
  const initialRange = parseRange(searchParams?.range);

  const hasOrders =
    data.daily.length > 0 ||
    data.topItems.length > 0 ||
    data.peakHours.length > 0 ||
    data.heatmap.length > 0 ||
    data.reviews.count > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Analytics</h1>
        <p className="text-sm text-zinc-600">
          Date actualizate la fiecare 5 minute. Toate sumele sunt în RON.
        </p>
      </div>

      <AnalyticsClient data={data} hasOrders={hasOrders} initialRange={initialRange} />
    </div>
  );
}
