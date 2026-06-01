import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';
import { createAdminClient } from '@/lib/supabase/admin';
import { KyfForm } from './kyf-form';

export const dynamic = 'force-dynamic';

type KyfRow = {
  kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  cui: string | null;
  company_name: string | null;
  caen_code: string | null;
  reg_com: string | null;
  rejected_reason: string | null;
};

// Know Your Fleet: the fleet OWNER proves the company is real + active before
// the fleet can operate. CUI is auto-validated against the free ANAF API; the
// three documents ANAF doesn't expose are uploaded to the private fleet-kyf
// bucket. The platform (echipa HIR) verifies.
export default async function FleetKyfPage() {
  const fleet = await requireFleetManager();

  const admin = createAdminClient();
  const { data } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => Promise<{ data: KyfRow | null }>;
          };
        };
      };
    }
  )
    .from('fleet_kyf')
    .select('kyf_status, cui, company_name, caen_code, reg_com, rejected_reason')
    .eq('fleet_id', fleet.fleetId)
    .maybeSingle();

  const initial = data
    ? {
        status: data.kyf_status,
        cui: data.cui ?? '',
        companyName: data.company_name,
        caenCode: data.caen_code,
        regCom: data.reg_com,
        rejectedReason: data.rejected_reason,
      }
    : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/fleet/settings"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Înapoi la setări
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          Verificare firmă (KYF)
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Înainte ca flota să poată opera, confirmăm că firma este reală și activă:
          CUI verificat automat la ANAF, plus act constitutiv, extras de cont și
          certificat de înregistrare. Verificarea o face echipa HIR.
        </p>
      </div>

      <KyfForm fleetId={fleet.fleetId} initial={initial} />
    </div>
  );
}
