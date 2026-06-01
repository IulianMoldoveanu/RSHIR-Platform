// HIR Command Center — fleets (control levers), native.
// Lists every courier fleet with courier count + KYF status + the platform
// control switches (prefix, self-validate, KYC/KYF gates, active). Same
// Supabase project as the courier PWA. Platform-admin gated.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { FleetsClient, type FleetVM } from './_client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR Command Center — Flote',
  robots: 'noindex,nofollow',
};

type Sb = {
  from: (t: string) => {
    select: (cols: string) => Promise<{ data: Record<string, unknown>[] | null }> & {
      order: (c: string, o: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null }>;
    };
  };
};

export default async function FleetsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/fleets');
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

  const { data: fleetRows } = await db
    .from('courier_fleets')
    .select(
      'id, name, slug, tier, allowed_verticals, is_active, display_prefix, can_validate_couriers, kyc_required, kyf_required',
    )
    .order('name', { ascending: true });
  const fleets = (fleetRows ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    tier: string | null;
    allowed_verticals: string[] | null;
    is_active: boolean;
    display_prefix: string | null;
    can_validate_couriers: boolean;
    kyc_required: boolean;
    kyf_required: boolean;
  }>;

  const [{ data: profileRows }, { data: kyfRows }] = await Promise.all([
    db.from('courier_profiles').select('fleet_id, status'),
    db.from('fleet_kyf').select('fleet_id, kyf_status'),
  ]);

  const courierCount = new Map<string, { total: number; active: number }>();
  for (const p of (profileRows ?? []) as Array<{ fleet_id: string | null; status: string | null }>) {
    if (!p.fleet_id) continue;
    const c = courierCount.get(p.fleet_id) ?? { total: 0, active: 0 };
    c.total += 1;
    if (p.status === 'ACTIVE') c.active += 1;
    courierCount.set(p.fleet_id, c);
  }
  const kyfStatus = new Map<string, string>();
  for (const k of (kyfRows ?? []) as Array<{ fleet_id: string; kyf_status: string }>) {
    kyfStatus.set(k.fleet_id, k.kyf_status);
  }

  const vms: FleetVM[] = fleets.map((f) => ({
    id: f.id,
    name: f.name,
    slug: f.slug,
    tier: f.tier,
    allowedVerticals: f.allowed_verticals ?? [],
    isActive: f.is_active,
    displayPrefix: f.display_prefix,
    canValidateCouriers: f.can_validate_couriers,
    kycRequired: f.kyc_required,
    kyfRequired: f.kyf_required,
    courierTotal: courierCount.get(f.id)?.total ?? 0,
    courierActive: courierCount.get(f.id)?.active ?? 0,
    kyfStatus: kyfStatus.get(f.id) ?? null,
  }));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">Flote — control</h1>
            <p className="text-xs text-slate-500">
              Prefix afișat, delegare validare, porți KYC/KYF, activare — per flotă.
            </p>
          </div>
          <Link href="/dashboard/admin/hub" className="text-sm text-slate-400 hover:text-slate-200">
            ← Command Center
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <FleetsClient fleets={vms} />
      </div>
    </main>
  );
}
