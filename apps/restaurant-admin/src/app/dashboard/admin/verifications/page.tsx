// HIR Command Center — verification queue (courier KYC + fleet KYF), native.
// Reads the shared courier_kyc / fleet_kyf tables (same project as the courier
// PWA) + signed URLs for the private-bucket documents. Approve/Reject via the
// service_role actions. Platform-admin gated.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { VerificationsClient, type CourierVM, type FleetVM } from './_client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR Command Center — Verificări',
  robots: 'noindex,nofollow',
};

type SelectBuilder = {
  eq: (c: string, v: string) => SelectBuilder & Promise<{ data: Record<string, unknown>[] | null }>;
  in: (c: string, v: string[]) => SelectBuilder & Promise<{ data: Record<string, unknown>[] | null }>;
  not: (c: string, op: string, v: unknown) => SelectBuilder & Promise<{ data: Record<string, unknown>[] | null }>;
  order: (c: string, opts: { ascending: boolean }) => SelectBuilder & Promise<{ data: Record<string, unknown>[] | null }>;
};

type Sb = {
  from: (t: string) => {
    select: (cols: string) => SelectBuilder & Promise<{ data: Record<string, unknown>[] | null }>;
  };
  storage: {
    from: (b: string) => {
      createSignedUrl: (path: string, exp: number) => Promise<{ data: { signedUrl: string } | null }>;
    };
  };
};

export default async function VerificationsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/verifications');
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

  // 2026-06-15 — only show forms that have been TRIMIS spre verificare
  // (submitted_at IS NOT NULL). Drafts in progress are visible separately at
  // /dashboard/admin/fleets so Iulian doesn't get a flood of incomplete rows
  // in his review queue.
  const [{ data: kycRows }, { data: kyfRows }] = await Promise.all([
    db
      .from('courier_kyc')
      .select('courier_user_id, fleet_id, legal_name, cnp_last4, id_doc_url, selfie_url, submitted_at, created_at')
      .eq('kyc_status', 'PENDING')
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: true }),
    db
      .from('fleet_kyf')
      .select(
        'fleet_id, cui, company_name, reg_com, caen_code, address, vat_payer, anaf_active, act_constitutiv_url, extras_cont_url, certificat_inreg_url, submitted_at',
      )
      .eq('kyf_status', 'PENDING')
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: true }),
  ]);

  const kyc = (kycRows ?? []) as Array<{
    courier_user_id: string;
    fleet_id: string | null;
    legal_name: string | null;
    cnp_last4: string | null;
    id_doc_url: string | null;
    selfie_url: string | null;
    submitted_at: string | null;
    created_at: string | null;
  }>;
  const kyf = (kyfRows ?? []) as Array<{
    fleet_id: string;
    cui: string | null;
    company_name: string | null;
    reg_com: string | null;
    caen_code: string | null;
    address: string | null;
    vat_payer: boolean | null;
    anaf_active: boolean | null;
    act_constitutiv_url: string | null;
    extras_cont_url: string | null;
    certificat_inreg_url: string | null;
    submitted_at: string | null;
  }>;

  const courierIds = kyc.map((k) => k.courier_user_id);
  const profilesData = courierIds.length
    ? (await db.from('courier_profiles').select('user_id, full_name, city, vehicle_type').in('user_id', courierIds)).data ?? []
    : [];
  const profileMap = new Map(
    (profilesData as Array<{ user_id: string; full_name: string | null; city: string | null; vehicle_type: string | null }>).map(
      (p) => [p.user_id, p],
    ),
  );

  const fleetIds = Array.from(
    new Set([...kyc.map((k) => k.fleet_id), ...kyf.map((f) => f.fleet_id)].filter(Boolean) as string[]),
  );
  const fleetsData = fleetIds.length
    ? (await db.from('courier_fleets').select('id, name, display_prefix').in('id', fleetIds)).data ?? []
    : [];
  const fleetMap = new Map(
    (fleetsData as Array<{ id: string; name: string; display_prefix: string | null }>).map((f) => [
      f.id,
      { name: f.name, prefix: f.display_prefix },
    ]),
  );

  const couriers: CourierVM[] = await Promise.all(
    kyc.map(async (k) => {
      const p = profileMap.get(k.courier_user_id);
      const fleet = k.fleet_id ? fleetMap.get(k.fleet_id) : undefined;
      const [idDocUrl, selfieUrl] = await Promise.all([
        sign('courier-kyc', k.id_doc_url),
        sign('courier-kyc', k.selfie_url),
      ]);
      return {
        userId: k.courier_user_id,
        legalName: k.legal_name,
        fullName: p?.full_name ?? null,
        city: p?.city ?? null,
        vehicleType: p?.vehicle_type ?? null,
        fleetName: fleet?.name ?? null,
        fleetPrefix: fleet?.prefix ?? null,
        cnpLast4: k.cnp_last4,
        submittedAt: k.submitted_at ?? k.created_at,
        idDocUrl,
        selfieUrl,
      };
    }),
  );

  const fleets: FleetVM[] = await Promise.all(
    kyf.map(async (f) => {
      const [actUrl, extrasUrl, certificatUrl] = await Promise.all([
        sign('fleet-kyf', f.act_constitutiv_url),
        sign('fleet-kyf', f.extras_cont_url),
        sign('fleet-kyf', f.certificat_inreg_url),
      ]);
      return {
        fleetId: f.fleet_id,
        fleetName: fleetMap.get(f.fleet_id)?.name ?? null,
        cui: f.cui,
        companyName: f.company_name,
        regCom: f.reg_com,
        caenCode: f.caen_code,
        address: f.address,
        vatPayer: f.vat_payer,
        anafActive: f.anaf_active,
        submittedAt: f.submitted_at,
        actUrl,
        extrasUrl,
        certificatUrl,
      };
    }),
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">Verificări — curieri + flote</h1>
            <p className="text-xs text-slate-500">
              Identitate curieri (KYC) și legitimitate firme (KYF) în așteptare.
            </p>
          </div>
          <Link href="/dashboard/admin/hub" className="text-sm text-slate-400 hover:text-slate-200">
            ← Command Center
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <VerificationsClient couriers={couriers} fleets={fleets} />
      </div>
    </main>
  );
}
