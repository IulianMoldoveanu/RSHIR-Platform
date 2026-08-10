// Stream 7 (Non-EU permit verify) — admin review queue.
//
// HIR Command Center → Permise non-UE. Lists every courier_profiles row
// flagged is_non_eu_resident=true, with one card per courier. Approve flips
// permit_status PENDING → VERIFIED + stamps permit_verified_at + permit_verified_by.
// Reject flips PENDING → REJECTED with a required reason (stored in the
// audit table via the DB trigger from migration 20260616_014).
//
// Bulk approve: only the currently visible PENDING permits can be batch-
// approved (defensive — keeps the operator from approving a status they
// haven't seen). One server action per courier internally so the audit
// trigger fires per row and the audit log stays per-courier.
//
// Gated by HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED. Platform admin only.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { Icon } from '@/app/marketplace/_components/ui';
import { PermitsClient, type PermitVM } from './_client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR Command Center — Permise non-UE',
  robots: 'noindex,nofollow',
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  city: string | null;
  vehicle_type: string | null;
  fleet_id: string | null;
  is_non_eu_resident: boolean | null;
  permit_country_iso: string | null;
  permit_munca_valid_until: string | null;
  permit_doc_url: string | null;
  permit_status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  permit_verified_at: string | null;
  updated_at: string | null;
};

type FleetRow = { id: string; name: string; display_prefix: string | null };

type Sb = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (
        c: string,
        v: unknown,
      ) => SbSelectChain & Promise<{ data: ProfileRow[] | null }>;
      in: (
        c: string,
        v: string[],
      ) => SbSelectChain & Promise<{ data: FleetRow[] | null }>;
    };
  };
  storage: {
    from: (b: string) => {
      createSignedUrl: (
        path: string,
        exp: number,
      ) => Promise<{ data: { signedUrl: string } | null }>;
    };
  };
};

type SbSelectChain = {
  order: (
    c: string,
    opts: { ascending: boolean },
  ) => Promise<{ data: ProfileRow[] | null }>;
};

function isFeatureEnabled(): boolean {
  return process.env.HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED === 'true';
}

export default async function PermitsAdminPage() {
  if (!isFeatureEnabled()) notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/permits');
  if (!isPlatformAdminEmail(user.email)) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-slate-100">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Acces interzis: rezervat administratorilor de platformă HIR.
        </div>
      </main>
    );
  }

  const db = createAdminClient() as unknown as Sb;

  async function sign(bucket: string, path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data } = await db.storage.from(bucket).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  const { data: profileRows } = await db
    .from('courier_profiles')
    .select(
      'user_id, full_name, city, vehicle_type, fleet_id, is_non_eu_resident, permit_country_iso, permit_munca_valid_until, permit_doc_url, permit_status, permit_verified_at, updated_at',
    )
    .eq('is_non_eu_resident', true)
    .order('updated_at', { ascending: false });

  const profiles = (profileRows ?? []) as ProfileRow[];

  const fleetIds = Array.from(
    new Set(profiles.map((p) => p.fleet_id).filter(Boolean) as string[]),
  );
  const fleetsData = fleetIds.length
    ? (await db
        .from('courier_fleets')
        .select('id, name, display_prefix')
        .in('id', fleetIds)).data ?? []
    : [];
  const fleetMap = new Map(
    (fleetsData as FleetRow[]).map((f) => [
      f.id,
      { name: f.name, prefix: f.display_prefix },
    ]),
  );

  const permits: PermitVM[] = await Promise.all(
    profiles.map(async (p): Promise<PermitVM> => {
      // Doc lives under the courier-kyc bucket with a permits/ prefix
      // (see permit-form.tsx upload path). Some legacy / future stores
      // may use a separate bucket — handle both by trying courier-kyc
      // first (the only one a permit doc lives in today).
      const docUrl = await sign('courier-kyc', p.permit_doc_url);
      const fleet = p.fleet_id ? fleetMap.get(p.fleet_id) : undefined;
      return {
        userId: p.user_id,
        fullName: p.full_name,
        city: p.city,
        vehicleType: p.vehicle_type,
        fleetName: fleet?.name ?? null,
        fleetPrefix: fleet?.prefix ?? null,
        countryIso: p.permit_country_iso,
        validUntil: p.permit_munca_valid_until,
        docUrl,
        status: p.permit_status,
        verifiedAt: p.permit_verified_at,
        updatedAt: p.updated_at,
      };
    }),
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">Permise non-UE</h1>
            <p className="text-xs text-slate-500">
              Verificare permis de muncă IGI pentru curierii non-UE (HIR PASIV M0-M24).
            </p>
          </div>
          <Link
            href="/dashboard/admin/hub"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-sm text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <Icon name="arrow-left" className="h-4 w-4" />
            Command Center
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <PermitsClient permits={permits} />
      </div>
    </main>
  );
}
