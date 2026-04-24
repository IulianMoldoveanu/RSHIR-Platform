import { getActiveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function DashboardOverviewPage() {
  const { tenant } = await getActiveTenant();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{tenant.name}</h1>
      <p className="text-sm text-zinc-600">
        Bun venit. Sprint 2 va aduce overview-ul cu vanzari + comenzi live.
      </p>
    </div>
  );
}
