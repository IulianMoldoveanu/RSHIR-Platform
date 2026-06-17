// /pfa-signup — Solo PFA self-serve onboarding wizard (Stream UI-1).
//
// VISION LOCKED 2026-06-16 (board verdict §11.1):
//   Each PFA (Persoană Fizică Autorizată) = its own micro-fleet with a single
//   member (himself). KYF-light flow (ANAF CUI + ID + selfie) is sufficient
//   for solo PFAs because there is no employer/employee relationship — the
//   PFA contracts directly with vendors via the open marketplace.
//
//   HIR4You FIREWALL preserved per Dir. UE 2024/2831 (transpunere RO
//   2dec2026): money vendor→PFA direct, control at PFA level, HIR = infra
//   only. Solo PFA = own fleet = own legs intact → zero employer-presumption.
//
// Pairs with:
//   - migration  20260616_010_solo_pfa_micro_fleet.sql
//   - edge fn    supabase/functions/pfa-onboarding-light
//   - shared     packages/shared-types/src/solo-pfa.ts
//
// Feature flag NEXT_PUBLIC_HIR_FEATURE_SOLO_PFA_ENABLED gates the page
// (notFound() when OFF, consistent with /fleet/marketplace pattern).

import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/app/_marketplace-ui';
import { PfaSignupForm } from './form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Înregistrare PFA — HIR Curier',
  robots: 'noindex,nofollow',
};

export default async function PfaSignupPage() {
  // Feature flag — keep the route invisible (404) when the program is off.
  // NEXT_PUBLIC_* so the same flag drives client + server checks.
  if (process.env.NEXT_PUBLIC_HIR_FEATURE_SOLO_PFA_ENABLED !== 'true') {
    notFound();
  }

  // Must be logged in (the edge fn requires a Bearer JWT, and the caller
  // user.id MUST equal body.owner_user_id — see pfa-onboarding-light §3).
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/pfa-signup');
  }

  return (
    <main className="min-h-screen bg-hir-bg px-4 py-8 text-hir-fg">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-lg px-2 py-2 text-sm font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden strokeWidth={1.75} />
          Înapoi
        </Link>

        <PageHeader
          variant="hero"
          eyebrow="ÎNROLARE PFA"
          title="Devino curier PFA pe HIR"
          description="Ai PFA cu activitate de curierat? Te înrolezi singur în 3 pași și începi să accepți curse din piață, fără să depinzi de o flotă."
        />

        <PfaSignupForm userId={user.id} userEmail={user.email ?? ''} />

        <p className="text-center text-[11px] leading-relaxed text-hir-muted-fg">
          Datele tale sunt stocate criptat. ANAF (CIF activ) și actele se verifică
          automat — durează sub un minut.
        </p>
      </div>
    </main>
  );
}
