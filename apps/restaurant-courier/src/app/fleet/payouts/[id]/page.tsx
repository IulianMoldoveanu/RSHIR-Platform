import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import { ApproveButton } from './approve-button';
import { MarkPaidForm } from './mark-paid-form';

export const dynamic = 'force-dynamic';

type PayoutStatus = 'PENDING' | 'APPROVED' | 'PAID';

type PeriodRow = {
  id: string;
  courier_user_id: string;
  period_start: string;
  period_end: string;
  status: PayoutStatus;
  total_cents: number;
  deliveries_count: number;
  paid_at: string | null;
  paid_method: string | null;
  payment_ref: string | null;
  created_at: string;
};

type ItemRow = {
  id: string;
  amount_cents: number;
  // Authoritative link to the order (works even with no pricing row).
  delivery_id: string | null;
  delivery_pricing_id: string | null;
  // Sourced via the join on delivery_pricings (null in zone-less cities):
  delivery_pricings: {
    delivery_id: string;
    computed_at: string;
    restaurant_fee_cents: number;
    courier_payout_cents: number;
  } | null;
};

function formatRon(cents: number): string {
  return `${(cents / 100).toFixed(2)} RON`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function FleetPayoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  const { id: periodId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: periodData } = await sb
    .from('payout_periods')
    .select(
      'id, courier_user_id, period_start, period_end, status, total_cents, deliveries_count, paid_at, paid_method, payment_ref, created_at',
    )
    .eq('id', periodId)
    .maybeSingle();

  const period = periodData as PeriodRow | null;
  if (!period) notFound();

  // Defence-in-depth: the period must belong to a courier in this fleet
  // (the action layer also checks, but rendering a foreign period leaks
  // payout amounts cross-fleet).
  const { data: profile } = await sb
    .from('courier_profiles')
    .select('user_id, full_name')
    .eq('user_id', period.courier_user_id)
    .eq('fleet_id', fleet.fleetId)
    .maybeSingle();
  if (!profile) notFound();

  const courierName = (profile as { full_name: string | null }).full_name ?? '—';

  // Items + their pricing snapshot (one query — supabase-js does the join).
  const { data: itemsData } = await sb
    .from('payout_items')
    .select(
      'id, amount_cents, delivery_id, delivery_pricing_id, delivery_pricings ( delivery_id, computed_at, restaurant_fee_cents, courier_payout_cents )',
    )
    .eq('payout_period_id', periodId)
    .order('id', { ascending: true });

  const items = (itemsData ?? []) as ItemRow[];

  const status: PayoutStatus = period.status;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link
        href="/fleet/payouts"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-hir-muted-fg hover:text-violet-400"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden /> Înapoi la perioade
      </Link>

      <div className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-hir-fg">
              {courierName}
            </h1>
            <p className="mt-1 text-sm text-hir-muted-fg">
              {formatDate(period.period_start)} → {formatDate(period.period_end)}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <Row label="Livrări" value={String(period.deliveries_count)} />
          <Row label="Total" value={formatRon(period.total_cents)} bold />
          <Row label="Creat" value={formatDateTime(period.created_at)} />
          {period.paid_at ? (
            <Row label="Plătit la" value={formatDateTime(period.paid_at)} />
          ) : null}
          {period.paid_method ? (
            <Row label="Metodă" value={period.paid_method} />
          ) : null}
          {period.payment_ref ? (
            <Row label="Referință" value={period.payment_ref} />
          ) : null}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/fleet/payouts/${period.id}/export`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hir-border bg-hir-bg px-3 py-2 text-xs font-semibold text-hir-fg hover:bg-hir-border/60"
            download
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Export SEPA CSV
          </a>
        </div>
      </div>

      {/* Action zone — only shows what's actionable from the current state. */}
      {status === 'PENDING' ? (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-300">
            Aprobare necesară
          </h2>
          <p className="mb-3 text-xs text-hir-muted-fg">
            După aprobare, perioada poate fi marcată plătită.
          </p>
          <ApproveButton periodId={period.id} />
        </section>
      ) : null}

      {status === 'APPROVED' ? (
        <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
          <h2 className="mb-2 text-sm font-semibold text-violet-300">
            Marchează ca plătit
          </h2>
          <p className="mb-3 text-xs text-hir-muted-fg">
            Confirmă că ai efectuat transferul către curier. Referința e
            opțională (recomandat: OP nr. sau ID chitanță pentru
            reconciliere).
          </p>
          <MarkPaidForm periodId={period.id} />
        </section>
      ) : null}

      <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-hir-fg">
          Livrări ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hir-border bg-hir-bg px-4 py-5 text-center text-xs text-hir-muted-fg">
            Nicio livrare alocată acestei perioade.
          </p>
        ) : (
          <ul className="divide-y divide-hir-border text-xs">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-hir-muted-fg">
                    {it.delivery_id ?? it.delivery_pricings?.delivery_id ?? it.delivery_pricing_id ?? '—'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-hir-muted-fg">
                    {it.delivery_pricings?.computed_at
                      ? formatDateTime(it.delivery_pricings.computed_at)
                      : '—'}
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-emerald-300">
                  {formatRon(it.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: PayoutStatus }) {
  const colors: Record<PayoutStatus, string> = {
    PENDING: 'bg-amber-500/10 text-amber-300',
    APPROVED: 'bg-violet-500/10 text-violet-300',
    PAID: 'bg-emerald-500/10 text-emerald-300',
  };
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${colors[status]}`}
    >
      {status}
    </span>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-hir-muted-fg">
        {label}
      </dt>
      <dd className={bold ? 'text-sm font-semibold text-emerald-300' : 'text-sm text-hir-fg'}>
        {value}
      </dd>
    </div>
  );
}
