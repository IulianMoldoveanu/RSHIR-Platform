import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '@hir/ui';
import { computeOnboardingState } from '@/lib/onboarding';
import { getActiveTenant } from '@/lib/tenant';
import { PolishChecklist } from './polish-checklist';
import { KpiCards } from './kpi-cards';
import { ActiveOrdersPanel } from './active-orders-panel';
import { CodPendingPanel } from './cod-pending-panel';
import { TodayReservationsPanel } from './today-reservations-panel';

export const dynamic = 'force-dynamic';

function KpiSkeleton() {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-zinc-200 bg-white p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </section>
  );
}

function ActiveSkeleton() {
  return (
    <section>
      <Skeleton className="mb-2 h-4 w-32" />
      <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: { skipOnboarding?: string };
}) {
  const { tenant } = await getActiveTenant();

  if (searchParams?.skipOnboarding !== '1') {
    const state = await computeOnboardingState(tenant.id);
    if (!state.went_live) redirect('/dashboard/onboarding');
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{tenant.name}</h1>
          <p className="text-sm text-zinc-600">Panou de control — astăzi.</p>
        </div>
        <Link
          href="/dashboard/analytics"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          Vezi raport complet
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <Suspense fallback={<KpiSkeleton />}>
        <KpiCards tenantId={tenant.id} />
      </Suspense>

      <Suspense fallback={null}>
        <CodPendingPanel tenantId={tenant.id} />
      </Suspense>

      <Suspense fallback={<ActiveSkeleton />}>
        <ActiveOrdersPanel tenantId={tenant.id} />
      </Suspense>

      <Suspense fallback={null}>
        <TodayReservationsPanel tenantId={tenant.id} />
      </Suspense>

      <PolishChecklist tenantId={tenant.id} />
    </div>
  );
}
