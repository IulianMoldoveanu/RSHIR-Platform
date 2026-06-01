// /admin/verifications — platform queue of PENDING courier KYC + fleet KYF.
// Reviewer sees the manager-entered data + ANAF data + signed links to the
// private-bucket documents, then approves or rejects. All writes go through
// the service_role server actions (verifyCourierKyc / verifyFleetKyf).

import { requirePlatformAdmin } from '@/lib/platform-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { VerificationsClient, type CourierVM, type FleetVM } from './_client';

export const dynamic = 'force-dynamic';

type SelectBuilder = {
  eq: (c: string, v: string) => Promise<{ data: Record<string, unknown>[] | null }>;
  in: (c: string, v: string[]) => Promise<{ data: Record<string, unknown>[] | null }>;
};
type Sb = {
  from: (t: string) => { select: (cols: string) => SelectBuilder };
  storage: {
    from: (b: string) => {
      createSignedUrl: (path: string, exp: number) => Promise<{ data: { signedUrl: string } | null }>;
    };
  };
};

export default async function VerificationsPage() {
  await requirePlatformAdmin();
  const db = createAdminClient() as unknown as Sb;

  async function sign(bucket: string, path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data } = await db.storage.from(bucket).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  // PENDING courier KYC + fleet KYF.
  const [{ data: kycRows }, { data: kyfRows }] = await Promise.all([
    db
      .from('courier_kyc')
      .select('courier_user_id, fleet_id, legal_name, cnp_last4, id_doc_url, selfie_url, submitted_at, created_at')
      .eq('kyc_status', 'PENDING'),
    db
      .from('fleet_kyf')
      .select(
        'fleet_id, cui, company_name, reg_com, caen_code, address, vat_payer, anaf_active, act_constitutiv_url, extras_cont_url, certificat_inreg_url, submitted_at',
      )
      .eq('kyf_status', 'PENDING'),
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

  // Profiles for the courier rows (full name + city + vehicle).
  const courierIds = kyc.map((k) => k.courier_user_id);
  const profilesData = courierIds.length
    ? (await db
        .from('courier_profiles')
        .select('user_id, full_name, city, vehicle_type')
        .in('user_id', courierIds)).data ?? []
    : [];
  const profiles = profilesData as Array<{
    user_id: string;
    full_name: string | null;
    city: string | null;
    vehicle_type: string | null;
  }>;
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

  // Fleet names for both lists.
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

  // Build courier view models with signed doc URLs.
  const couriers: CourierVM[] = await Promise.all(
    kyc.map(async (k) => {
      const p = profileMap.get(k.courier_user_id);
      const [idDocUrl, selfieUrl] = await Promise.all([
        sign('courier-kyc', k.id_doc_url),
        sign('courier-kyc', k.selfie_url),
      ]);
      const fleet = k.fleet_id ? fleetMap.get(k.fleet_id) : undefined;
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Verificări</h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          Identitate curieri (KYC) și legitimitate firme (KYF) în așteptare. Aprobă sau respinge
          după ce verifici documentele.
        </p>
      </div>

      <VerificationsClient couriers={couriers} fleets={fleets} />
    </div>
  );
}
