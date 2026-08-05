// HIR Command Center — facturare flote (B2B), native.
//
// One screen for the money that flows from HIR to a fleet: the negotiated rate
// per delivery, and the weekly invoice built from it. The money that flows from
// the fleet to its couriers is deliberately not here — it is the fleet's own
// arrangement, priced in its own panel, and mixing the two on one screen is
// exactly how a supplier relationship starts looking like an employment one.
//
// Platform-admin gated.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { FleetBillingClient, type FleetBillingVM } from './_client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR Command Center — Facturare flote',
  robots: 'noindex,nofollow',
};

type Row = Record<string, unknown>;

export default async function FleetBillingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/fleet-billing');
  if (!isPlatformAdminEmail(user.email)) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-slate-100">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Acces interzis: rezervat administratorilor de platformă HIR.
        </div>
      </main>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const [{ data: fleetRows }, { data: rateRows }, { data: periodRows }] = await Promise.all([
    db
      .from('courier_fleets')
      .select('id, name, is_active')
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    db
      .from('fleet_billing_tariffs')
      .select('fleet_id, city_id, per_delivery_cents, valid_from')
      .is('valid_until', null),
    db
      .from('fleet_invoice_periods')
      .select('id, fleet_id, period_start, period_end, status, total_cents, deliveries_count')
      .order('period_start', { ascending: false })
      .limit(60),
  ]);

  const fleets = (fleetRows ?? []) as Array<{ id: string; name: string; is_active: boolean }>;
  const rates = (rateRows ?? []) as Row[];
  const periods = (periodRows ?? []) as Row[];

  // How many lines in each period had no rate on file. Generated at zero on
  // purpose — a delivery HIR owes nothing for is a rate that was never set, and
  // it needs to be visible rather than absent.
  const periodIds = periods.map((p) => p.id as string);
  let unratedByPeriod = new Map<string, number>();
  if (periodIds.length > 0) {
    const { data: unrated } = await db
      .from('fleet_invoice_items')
      .select('invoice_period_id')
      .eq('source', 'unrated')
      .in('invoice_period_id', periodIds);
    unratedByPeriod = ((unrated ?? []) as Row[]).reduce((m: Map<string, number>, r: Row) => {
      const k = r.invoice_period_id as string;
      return m.set(k, (m.get(k) ?? 0) + 1);
    }, new Map<string, number>());
  }

  const vms: FleetBillingVM[] = fleets.map((f) => {
    const flat = rates.find((r) => r.fleet_id === f.id && r.city_id === null);
    const cityRates = rates.filter((r) => r.fleet_id === f.id && r.city_id !== null).length;
    return {
      id: f.id,
      name: f.name,
      isActive: f.is_active,
      perDeliveryCents: (flat?.per_delivery_cents as number | undefined) ?? null,
      rateSince: (flat?.valid_from as string | undefined) ?? null,
      cityRateCount: cityRates,
      periods: periods
        .filter((p) => p.fleet_id === f.id)
        .slice(0, 6)
        .map((p) => ({
          id: p.id as string,
          start: p.period_start as string,
          end: p.period_end as string,
          status: p.status as 'PENDING' | 'APPROVED' | 'PAID',
          totalCents: (p.total_cents as number) ?? 0,
          deliveries: (p.deliveries_count as number) ?? 0,
          unratedLines: unratedByPeriod.get(p.id as string) ?? 0,
        })),
    };
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">Facturare flote</h1>
            <p className="text-xs text-slate-500">
              Ce plătește HIR flotei: tarif fix pe livrare, negociat per flotă. Ce plătește flota
              curierilor se setează separat, în panoul flotei.
            </p>
          </div>
          <Link href="/dashboard/admin/hub" className="text-sm text-slate-400 hover:text-slate-200">
            ← Hub
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <FleetBillingClient fleets={vms} />
      </div>
    </main>
  );
}
