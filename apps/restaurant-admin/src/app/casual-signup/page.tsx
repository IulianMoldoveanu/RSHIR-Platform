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
import { ErrorState, EmptyMarketplaceState } from '@/app/marketplace/_components/ui';
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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 bg-gradient-to-br from-slate-50 to-[#f7f0fb] px-4 py-10">
        <ErrorState
          className="w-full max-w-md"
          title="Nu am putut încărca planurile de abonament."
          description="Reîncarcă pagina sau revino mai târziu."
        />
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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 bg-gradient-to-br from-slate-50 to-[#f7f0fb] px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <EmptyMarketplaceState
            title="Nicio variantă de abonament disponibilă."
            description="Contactează echipa HIR pentru a activa un plan."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 bg-gradient-to-br from-slate-50 to-[#f7f0fb] px-4 py-8 md:py-12">
      <div className="w-full max-w-2xl space-y-6">
        <header className="overflow-hidden rounded-[20px] bg-gradient-to-br from-[#4a1063] via-[#6b1f8a] to-[#8e3bb0] p-6 text-white shadow-[0_8px_30px_rgba(35,9,58,0.18)] md:p-8">
          <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white ring-1 ring-inset ring-white/25 backdrop-blur">
            HIR · Marketplace · Vendor ocazional
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] md:text-4xl">
            Înregistrare rapidă pe marketplace
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/90">
            Pornești o cerere de livrare ad-hoc fără să treci prin onboarding-ul
            complet. Verificare ușoară (CUI la ANAF) + abonament lunar = poți
            publica imediat.
          </p>
        </header>
        <CasualSignupForm plans={plans} prefillEmail={user.email ?? ''} />
        <p className="text-center text-xs text-slate-500">
          Vrei contul standard cu KYF complet?{' '}
          <a href="/signup" className="font-medium text-[#6b1f8a] underline underline-offset-2 hover:text-[#4a1063]">
            Înregistrare restaurant
          </a>
        </p>
      </div>
    </main>
  );
}
