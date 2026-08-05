// What HIR owes this fleet — the other half of the money, kept on its own page.
//
// /fleet/payouts is what the fleet pays its couriers, priced by the fleet in
// /fleet/tariffs. This page is the opposite direction: HIR's B2B rate per
// delivery and the invoice periods built from it. Read-only by design — the
// rate is negotiated, not self-served, and the lines are generated from
// delivered orders.
//
// The spread between the two pages is the fleet's margin. Nothing here exposes
// it to anyone else, and nothing on the courier side exposes this rate to a
// courier.

import Link from 'next/link';
import { FileText, Clock, CheckCircle2, Banknote } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';

export const dynamic = 'force-dynamic';

type InvoiceStatus = 'PENDING' | 'APPROVED' | 'PAID';

function formatRon(cents: number): string {
  return `${(cents / 100).toFixed(2)} RON`;
}

function formatDateRange(startIso: string, endIso: string): string {
  const fmt = (d: Date) => d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
  return `${fmt(new Date(startIso))} → ${fmt(new Date(endIso))}`;
}

const STATUS_META: Record<InvoiceStatus, { label: string; className: string; Icon: typeof Clock }> = {
  PENDING: { label: 'În lucru', className: 'bg-amber-500/10 text-amber-300', Icon: Clock },
  APPROVED: { label: 'Aprobat', className: 'bg-violet-500/10 text-violet-300', Icon: CheckCircle2 },
  PAID: { label: 'Plătit', className: 'bg-emerald-500/10 text-emerald-300', Icon: Banknote },
};

export default async function FleetBillingPage() {
  const fleet = await requireFleetManager();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [{ data: rateRows }, { data: periodRows }] = await Promise.all([
    admin
      .from('fleet_billing_tariffs')
      .select('city_id, per_delivery_cents, valid_from')
      .eq('fleet_id', fleet.fleetId)
      .is('valid_until', null),
    admin
      .from('fleet_invoice_periods')
      .select('id, period_start, period_end, status, total_cents, deliveries_count, paid_at, payment_ref')
      .eq('fleet_id', fleet.fleetId)
      .order('period_start', { ascending: false })
      .limit(24),
  ]);

  const rates = (rateRows ?? []) as Array<{
    city_id: string | null;
    per_delivery_cents: number;
    valid_from: string;
  }>;
  const flatRate = rates.find((r) => r.city_id === null) ?? null;
  const cityRates = rates.filter((r) => r.city_id !== null).length;

  const periods = (periodRows ?? []) as Array<{
    id: string;
    period_start: string;
    period_end: string;
    status: InvoiceStatus;
    total_cents: number;
    deliveries_count: number;
    paid_at: string | null;
    payment_ref: string | null;
  }>;

  const unpaidCents = periods
    .filter((p) => p.status !== 'PAID')
    .reduce((s, p) => s + p.total_cents, 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="font-display text-lg font-bold text-hir-fg">Facturare HIR</h1>
        <p className="mt-0.5 text-xs text-hir-muted-fg">
          Ce încasezi de la HIR pentru livrările efectuate. Ce plătești curierilor se setează în{' '}
          <Link href="/fleet/payouts" className="underline">
            deconturi
          </Link>
          .
        </p>
      </header>

      <section className="rounded-xl border border-hir-border bg-hir-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-hir-muted-fg">
          Tarif contractat
        </h2>
        {flatRate ? (
          <p className="mt-1 text-2xl font-bold text-hir-fg">
            {formatRon(flatRate.per_delivery_cents)}
            <span className="ml-1 text-sm font-normal text-hir-muted-fg">pe livrare</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-300">
            Niciun tarif activ. Livrările se listează la 0 până la stabilirea lui.
          </p>
        )}
        {cityRates > 0 && (
          <p className="mt-1 text-[11px] text-hir-muted-fg">
            {cityRates} tarif(e) pe oraș au prioritate față de cel de mai sus.
          </p>
        )}
        <p className="mt-2 text-[11px] text-hir-muted-fg">
          Tariful e fix pe livrare, indiferent de distanță — kilometrii rămân o chestiune între
          flotă și curier.
        </p>
      </section>

      {unpaidCents > 0 && (
        <section className="rounded-xl border border-hir-border bg-hir-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-hir-muted-fg">
            De încasat
          </h2>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{formatRon(unpaidCents)}</p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-hir-muted-fg">
          Perioade ({periods.length})
        </h2>
        {periods.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hir-border bg-hir-bg px-4 py-6 text-center text-xs text-hir-muted-fg">
            Nicio perioadă facturată încă.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {periods.map((p) => {
              const meta = STATUS_META[p.status];
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-hir-border bg-hir-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-hir-fg">
                      {formatDateRange(p.period_start, p.period_end)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-hir-muted-fg">
                      <FileText className="h-3 w-3" aria-hidden />
                      {p.deliveries_count} livrări
                      {p.payment_ref && <span className="ml-1">· {p.payment_ref}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold text-hir-fg">{formatRon(p.total_cents)}</span>
                    <span
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${meta.className}`}
                    >
                      <meta.Icon className="h-3 w-3" aria-hidden />
                      {meta.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
