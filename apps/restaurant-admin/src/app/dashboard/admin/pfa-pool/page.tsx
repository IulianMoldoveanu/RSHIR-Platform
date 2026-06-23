// HIR Command Center — Solo PFA pool oversight (Stream UI-1).
//
// VISION LOCKED 2026-06-16 (board verdict §11.1):
//   Each PFA = its own micro-fleet (is_pfa_solo=true). KYF-light flow
//   (ANAF + ID + selfie). This page is the platform-admin view of all
//   PFA-solo fleets — same `courier_fleets` + `fleet_kyf` tables the
//   /dashboard/admin/verifications page uses, but pre-filtered to
//   is_pfa_solo=true so Iulian can spot trends + manually override KYF
//   state (e.g. flip VERIFIED_PFA_LIGHT → REJECTED if a fraud signal
//   comes in, or back to VERIFIED_PFA_LIGHT after a fix).
//
// Reuses signed-URL pattern from /verifications. Platform-admin gated
// (HIR_PLATFORM_ADMIN_EMAILS). Feature flag
// HIR_FEATURE_SOLO_PFA_ENABLED gates the whole page (notFound() OFF).

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { Icon } from '@/app/marketplace/_components/ui';
import { PfaPoolClient, type PfaFleetVM } from './_client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR Command Center — Pool PFA',
  robots: 'noindex,nofollow',
};

type FleetRow = {
  id: string;
  name: string;
  pfa_cui: string | null;
  pfa_owner_user_id: string | null;
  is_active: boolean;
  display_prefix: string | null;
  primary_city_id: string | null;
  created_at: string | null;
};

type KyfRow = {
  fleet_id: string;
  cui: string | null;
  company_name: string | null;
  address: string | null;
  anaf_active: boolean | null;
  anaf_checked_at: string | null;
  act_constitutiv_url: string | null;
  certificat_inreg_url: string | null;
  kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'VERIFIED_PFA_LIGHT';
  submitted_at: string | null;
  verified_at: string | null;
  rejected_reason: string | null;
};

type KycRow = {
  courier_user_id: string;
  id_doc_url: string | null;
  selfie_url: string | null;
  kyc_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  legal_name: string | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
};

type Sb = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (c: string, v: string | boolean) => Promise<{ data: Record<string, unknown>[] | null }> & {
        order: (c: string, o: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null }>;
      };
      in: (c: string, v: string[]) => Promise<{ data: Record<string, unknown>[] | null }>;
    };
  };
  storage: {
    from: (b: string) => {
      createSignedUrl: (path: string, exp: number) => Promise<{ data: { signedUrl: string } | null }>;
    };
  };
};

export default async function PfaPoolPage() {
  if (process.env.HIR_FEATURE_SOLO_PFA_ENABLED !== 'true') notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/pfa-pool');
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

  // ── Pull every solo PFA fleet ─────────────────────────────────────────
  const { data: fleetRows } = await db
    .from('courier_fleets')
    .select(
      'id, name, pfa_cui, pfa_owner_user_id, is_active, display_prefix, primary_city_id, created_at',
    )
    .eq('is_pfa_solo', true)
    .order('created_at', { ascending: false });
  const fleets = (fleetRows ?? []) as FleetRow[];

  const fleetIds = fleets.map((f) => f.id);
  const ownerIds = fleets.map((f) => f.pfa_owner_user_id).filter(Boolean) as string[];

  const [{ data: kyfRowsRaw }, { data: profileRowsRaw }, { data: kycRowsRaw }] = await Promise.all([
    fleetIds.length
      ? db
          .from('fleet_kyf')
          .select(
            'fleet_id, cui, company_name, address, anaf_active, anaf_checked_at, act_constitutiv_url, certificat_inreg_url, kyf_status, submitted_at, verified_at, rejected_reason',
          )
          .in('fleet_id', fleetIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] | null }),
    ownerIds.length
      ? db.from('courier_profiles').select('user_id, full_name, phone').in('user_id', ownerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] | null }),
    ownerIds.length
      ? db
          .from('courier_kyc')
          .select('courier_user_id, id_doc_url, selfie_url, kyc_status, legal_name')
          .in('courier_user_id', ownerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] | null }),
  ]);

  const kyfByFleet = new Map(
    ((kyfRowsRaw ?? []) as KyfRow[]).map((k) => [k.fleet_id, k]),
  );
  const profileByUser = new Map(
    ((profileRowsRaw ?? []) as ProfileRow[]).map((p) => [p.user_id, p]),
  );
  const kycByUser = new Map(
    ((kycRowsRaw ?? []) as KycRow[]).map((k) => [k.courier_user_id, k]),
  );

  async function sign(bucket: string, path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data } = await db.storage.from(bucket).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  const vms: PfaFleetVM[] = await Promise.all(
    fleets.map(async (f) => {
      const kyf = kyfByFleet.get(f.id) ?? null;
      const profile = f.pfa_owner_user_id ? profileByUser.get(f.pfa_owner_user_id) ?? null : null;
      const kyc = f.pfa_owner_user_id ? kycByUser.get(f.pfa_owner_user_id) ?? null : null;
      // The PFA wizard uploads to the `courier-kyc` bucket (mobile-friendly,
      // same RLS the existing KYC flow uses). Older KYF docs live in
      // `fleet-kyf` — try the cheap path first, fall back to courier-kyc.
      const [idDocUrl, selfieUrl] = await Promise.all([
        sign('courier-kyc', kyc?.id_doc_url ?? null),
        sign('courier-kyc', kyc?.selfie_url ?? null),
      ]);
      return {
        fleetId: f.id,
        fleetName: f.name,
        cui: f.pfa_cui ?? kyf?.cui ?? null,
        companyName: kyf?.company_name ?? null,
        ownerUserId: f.pfa_owner_user_id,
        ownerName: profile?.full_name ?? kyc?.legal_name ?? null,
        ownerPhone: profile?.phone ?? null,
        isActive: f.is_active,
        kyfStatus: kyf?.kyf_status ?? null,
        kycStatus: kyc?.kyc_status ?? null,
        anafActive: kyf?.anaf_active ?? null,
        anafCheckedAt: kyf?.anaf_checked_at ?? null,
        verifiedAt: kyf?.verified_at ?? null,
        submittedAt: kyf?.submitted_at ?? null,
        rejectedReason: kyf?.rejected_reason ?? null,
        createdAt: f.created_at,
        address: kyf?.address ?? null,
        idDocUrl,
        selfieUrl,
      };
    }),
  );

  const counts = {
    total: vms.length,
    verified: vms.filter((v) => v.kyfStatus === 'VERIFIED_PFA_LIGHT' || v.kyfStatus === 'VERIFIED').length,
    pending: vms.filter((v) => v.kyfStatus === 'PENDING' || !v.kyfStatus).length,
    rejected: vms.filter((v) => v.kyfStatus === 'REJECTED').length,
    inactive: vms.filter((v) => !v.isActive).length,
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold">Pool PFA — solo micro-fleets</h1>
            <p className="text-xs text-slate-500">
              Toate PFA-urile înrolate prin KYF-light (ANAF + ID + selfie). Override manual din carduri.
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
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <CountTile label="Total" value={counts.total} tone="neutral" />
          <CountTile label="Verificate" value={counts.verified} tone="emerald" />
          <CountTile label="În așteptare" value={counts.pending} tone="amber" />
          <CountTile label="Respinse" value={counts.rejected} tone="rose" />
          <CountTile label="Inactive" value={counts.inactive} tone="slate" />
        </div>
        <PfaPoolClient fleets={vms} />
      </div>
    </main>
  );
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const toneClass = {
    neutral: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    slate: 'border-slate-700 bg-slate-800/40 text-slate-300',
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
