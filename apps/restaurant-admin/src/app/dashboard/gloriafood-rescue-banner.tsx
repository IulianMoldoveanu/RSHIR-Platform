import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { computeOnboardingState } from '@/lib/onboarding';

// Catches operators who skipped the onboarding wizard but still have an empty
// menu. The GloriaFood importer is otherwise hidden behind step 1 of the
// wizard — invisible to anyone who clicked "skip" on first run. With
// GloriaFood retiring 2027-04-30, this is HIR's strongest sales narrative
// and we want a one-click path to the migration tool from the home screen.
export async function GloriaFoodRescueBanner({ tenantId }: { tenantId: string }) {
  const state = await computeOnboardingState(tenantId);
  // Only show for live tenants who skipped onboarding without a menu — the
  // wizard already surfaces the importer for tenants still in flow.
  if (!state.went_live || state.menu_added) return null;

  return (
    <Link
      href="/dashboard/onboarding/migrate-from-gloriafood"
      className="group block overflow-hidden rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-4 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-purple-100">
            <Sparkles className="h-4 w-4 text-purple-700" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">
              Vii de pe GloriaFood? Importă meniul în 5 minute.
            </p>
            <p className="mt-0.5 text-xs text-zinc-700">
              GloriaFood se închide pe 30 aprilie 2027. Avem un importer care ia categoriile,
              prețurile și descrierile dintr-un CSV sau direct din pagina ta GloriaFood.
            </p>
          </div>
        </div>
        <span className="inline-flex flex-none items-center gap-1 text-xs font-medium text-purple-700 group-hover:text-purple-900">
          Importă acum
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
