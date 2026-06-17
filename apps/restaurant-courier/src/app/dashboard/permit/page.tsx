// Stream 7 (Non-EU permit verify) — courier-side permit page.
//
// HIR PASIV M0-M24 per board verdict §11.5: HIR verifies an EXISTING IGI
// work permit; HIR DOES NOT acquire one on behalf of the courier. This page
// is the courier's read/upload surface for permit_doc_url + the four scalar
// fields persisted in public.courier_profiles (migration 20260616_014).
//
// Visibility rules:
//   - Courier with is_non_eu_resident=false sees a short notice + nothing
//     to do (EU residents are not gated by the permit flow).
//   - Courier with is_non_eu_resident=true sees the form, the current
//     permit_status badge (PENDING/VERIFIED/REJECTED/EXPIRED), the upload
//     slot for permit_doc_url, the country ISO field, and the validity-date
//     field. They can resubmit at any time (resubmission flips status back
//     to PENDING via the server action).
//   - Verified non-EU couriers see the badge + expiry countdown + a button
//     to re-upload should the IGI permit be renewed.
//
// Feature flag (HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED) gates the route at
// render time — when off, the page returns notFound() so the surface
// disappears entirely (consistent with marketplace gating in this app).

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/app/_marketplace-ui';
import { PermitForm, type PermitInitial } from './permit-form';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  user_id: string;
  is_non_eu_resident: boolean | null;
  permit_country_iso: string | null;
  permit_munca_valid_until: string | null;
  permit_doc_url: string | null;
  permit_status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  permit_verified_at: string | null;
};

function isFeatureEnabled(): boolean {
  return process.env.HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED === 'true';
}

export default async function PermitPage() {
  if (!isFeatureEnabled()) notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // courier_profiles permit columns are post-migration, not in generated
  // Supabase types yet — narrow shape cast as in other post-migration reads
  // in this app.
  const { data: profileRaw } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{ data: ProfileRow | null }>;
          };
        };
      };
    }
  )
    .from('courier_profiles')
    .select(
      'user_id, is_non_eu_resident, permit_country_iso, permit_munca_valid_until, permit_doc_url, permit_status, permit_verified_at',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  const profile = profileRaw ?? null;

  // Courier may not have a profile row yet (newly created account). Treat as
  // "not flagged non-EU" — they reach the form via onboarding before this
  // page becomes relevant.
  const isNonEu = profile?.is_non_eu_resident === true;
  const status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' =
    profile?.permit_status ?? 'PENDING';

  const initial: PermitInitial = {
    isNonEu,
    status,
    countryIso: profile?.permit_country_iso ?? '',
    validUntil: profile?.permit_munca_valid_until ?? '',
    docPath: profile?.permit_doc_url ?? null,
    verifiedAt: profile?.permit_verified_at ?? null,
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader
        variant="hero"
        eyebrow="PERMIS DE MUNCĂ"
        title="Permis de muncă (non-UE)"
        description="Cetățenii non-UE pot livra pe HIR doar cu permis de muncă valid emis de IGI (Inspectoratul General pentru Imigrări). HIR verifică permisul tău existent; nu îl emite în numele tău."
      />

      {!isNonEu ? (
        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-100">
          <p className="font-semibold">Nu este necesar permis de muncă</p>
          <p className="mt-1 text-emerald-100/80">
            Contul tău nu este marcat ca cetățean non-UE. Dacă această informație este
            greșită, contactează suportul pentru a actualiza statutul.
          </p>
        </section>
      ) : (
        <PermitForm userId={user.id} initial={initial} />
      )}

      {isNonEu ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-100/90">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden strokeWidth={1.75} />
            <div>
              <p className="font-semibold">Important — HIR PASIV M0-M24</p>
              <p className="mt-1 text-amber-100/80">
                Până când HIR activează parteneriatul cu AIRO / GlobalWorker (planificat
                2028), HIR doar verifică un permis emis deja de IGI. Nu poate intermedia
                obținerea unui permis în numele tău. Flota responsabilă de tine asigură
                obligațiile angajatorului după ce permisul este VERIFICAT și valabil.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden strokeWidth={1.75} />
        Înapoi la setări
      </Link>
    </div>
  );
}
