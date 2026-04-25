import { getActiveTenant } from '@/lib/tenant';
import { loadAnalytics } from './data';
import { AnalyticsClient } from './analytics-client';

export const revalidate = 300; // 5 min cache.

export default async function AnalyticsPage() {
  const { tenant } = await getActiveTenant();
  const data = await loadAnalytics(tenant.id);

  const hasOrders =
    data.daily.length > 0 ||
    data.topItems.length > 0 ||
    data.peakHours.length > 0 ||
    data.heatmap.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Analytics</h1>
        <p className="text-sm text-zinc-600">
          Date actualizate la fiecare 5 minute. Toate sumele sunt în RON.
        </p>
      </div>

      <AnalyticsClient data={data} hasOrders={hasOrders} />
    </div>
  );
}
