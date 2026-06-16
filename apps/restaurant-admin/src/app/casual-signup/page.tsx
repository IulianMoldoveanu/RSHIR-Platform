// /casual-signup — self-serve onboarding for CASUAL tenants
// (Bursa Transporturilor pattern, board verdict §11.2).
//
// Stream UI-2 — pairs with supabase/functions/casual-vendor-signup/index.ts and
// migration 20260616_011_casual_vendor_subscriptions.sql.
//
// Differs from /signup (which creates FULL tenant + full KYF + onboarding
// wizard) — this is the light-verification path: ANAF lookup + brand picker +
// subscription tier choice + confirm. Trial subscription (+30 days) issued on
// success. Tenant lands in tenants.status='ONBOARDING' (pending manual
// admin verification at /dashboard/admin/casual-vendors).
//
// Feature flag gate: HIR_FEATURE_CASUAL_VENDOR_ENABLED. Page calls notFound()
// when off so the route 404s entirely (defense in depth — the edge fn also
// returns 503).

import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { CasualSignupForm, type SubscriptionPlanOption } from './form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Înregistrare vendor ocazional — HIR Marketplace',
  robots: 'noindex,nofollow',
};

export default async function CasualSignupPage(): Promise<JSX.Element> {
  if (process.env.HIR_FEATURE_CASUAL_VENDOR_ENABLED !== 'true') notFound();

  // Caller MUST be authenticated — the edge fn requires a bearer JWT. If they
  // aren't logged in, bounce them to /login with a return URL.
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/casual-signup');

  // Resolve subscription plans from DB so the tier prices stay in sync with the
  // catalog (subscription_plans is seeded by migration 20260616_011 — basic 49,
  // pro 199, enterprise 499). RLS allows authenticated SELECT on active=TRUE,
  // but the admin client bypasses RLS anyway and is cheaper than a per-request
  // session-cookie roundtrip.
  const admin = createAdminClientUntyped();
  const { data: planRows, error: planErr } = await admin
    .from('subscription_plans')
    .select('tier_code, monthly_price_ron, features, max_listings_per_month, max_offers_per_month')
    .eq('active', true)
    .order('monthly_price_ron', { ascending: true });

  if (planErr) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
        <div className="w-full max-w-md rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Nu am putut încărca planurile de abonament: {planErr.message}
        </div>
      </main>
    );
  }

  const plans: SubscriptionPlanOption[] = (planRows ?? []).map(
    (row: {
      tier_code: string;
      monthly_price_ron: number;
      features: Record<string, unknown> | null;
      max_listings_per_month: number | null;
      max_offers_per_month: number | null;
    }) => {
      const features = row.features ?? {};
      const displayName =
        typeof features.display_name === 'string' && features.display_name.trim().length > 0
          ? features.display_name
          : row.tier_code.charAt(0).toUpperCase() + row.tier_code.slice(1);
      const description =
        typeof features.description === 'string' ? features.description : '';
      return {
        tierCode: row.tier_code as SubscriptionPlanOption['tierCode'],
        displayName,
        description,
        monthlyPriceRon: row.monthly_price_ron,
        maxListingsPerMonth: row.max_listings_per_month,
        maxOffersPerMonth: row.max_offers_per_month,
      };
    },
  );

  // Defensive: if seed missed, render an explicit error instead of an empty
  // selector that submits with no choice.
  if (plans.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nicio variantă de abonament disponibilă. Contactează echipa HIR.
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            HIR Marketplace · Vendor ocazional
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
            Înregistrare rapidă pe marketplace
          </h1>
          <p className="text-sm text-zinc-600">
            Pornești o cerere de livrare ad-hoc fără să treci prin onboarding-ul
            complet. Verificare ușoară (CUI la ANAF) + abonament lunar = poți
            publica imediat.
          </p>
        </header>
        <CasualSignupForm plans={plans} prefillEmail={user.email ?? ''} />
        <p className="text-center text-xs text-zinc-500">
          Vrei contul standard cu KYF complet?{' '}
          <a href="/signup" className="underline">
            Înregistrare restaurant
          </a>
        </p>
      </div>
    </main>
  );
}
