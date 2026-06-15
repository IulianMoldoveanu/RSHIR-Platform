import { SignupForm } from './signup-form';
import { listActiveCities } from '@/lib/cities';

export const dynamic = 'force-dynamic';

export default async function SignupPage(
  props: {
    searchParams: Promise<{ ref?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const ref = typeof searchParams.ref === 'string' ? searchParams.ref.trim().toLowerCase() : undefined;
  // 2026-06-15 — capture city at signup so tenants.city_id is set from day 1.
  // Audit found tenant created with city_id=NULL was the cause for unscoped
  // queries (listTenantsByCity / fleet-allocation) missing the tenant.
  const cities = await listActiveCities();

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">HIR Restaurant</h1>
          <p className="text-sm text-zinc-600">
            Site propriu, comenzi online, livrare. Demo gratuit Brașov.
          </p>
        </div>
        <SignupForm referralCode={ref} cities={cities} />
      </div>
    </main>
  );
}
