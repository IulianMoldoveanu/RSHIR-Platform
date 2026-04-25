import { redirect } from 'next/navigation';
import { computeOnboardingState } from '@/lib/onboarding';
import { getActiveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

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
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{tenant.name}</h1>
      <p className="text-sm text-zinc-600">
        Bun venit. Sprint 2 va aduce overview-ul cu vanzari + comenzi live.
      </p>
    </div>
  );
}
