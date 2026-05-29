import Link from 'next/link';
import { Banknote, CheckCircle2, Clock, Download } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';

export const dynamic = 'force-dynamic';

type PayoutStatus = 'PENDING' | 'APPROVED' | 'PAID';
type FilterValue = PayoutStatus | 'ALL';

type PayoutPeriodRow = {
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
};

type CourierRow = {
  user_id: string;
  full_name: string | null;
};

const VALID_FILTERS = new Set<FilterValue>(['ALL', 'PENDING', 'APPROVED', 'PAID']);

function formatRon(cents: number): string {
  return `${(cents / 100).toFixed(2)} RON`;
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = (d: Date) =>
    d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
  return `${fmt(start)} → ${fmt(end)}`;
}

export default async function FleetPayoutsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  const sp = (await searchParams) ?? {};
  const rawFilter = (sp.status ?? 'ALL').toUpperCase();
  const filter: FilterValue = VALID_FILTERS.has(rawFilter as FilterValue)
    ? (rawFilter as FilterValue)
    : 'ALL';

  // Resolve couriers in this fleet — payout_periods is keyed by user_id
  // (auth.users) and the schema gives us no direct fleet_id link on the
  // period, so we filter through courier_profiles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: couriersData } = await sb
    .from('courier_profiles')
    .select('user_id, full_name')
    .eq('fleet_id', fleet.fleetId);
  const couriers = (couriersData ?? []) as CourierRow[];
  const courierIds = couriers.map((c) => c.user_id);
  const courierName = new Map(couriers.map((c) => [c.user_id, c.full_name ?? '—']));

  let periods: PayoutPeriodRow[] = [];
  if (courierIds.length > 0) {
    let query = sb
      .from('payout_periods')
      .select(
        'id, courier_user_id, period_start, period_end, status, total_cents, deliveries_count, paid_at, paid_method, payment_ref',
      )
      .in('courier_user_id', courierIds)
      .order('period_end', { ascending: false })
      .limit(200);
    if (filter !== 'ALL') {
      query = query.eq('status', filter);
    }
    const { data } = await query;
    periods = (data ?? []) as PayoutPeriodRow[];
  }

  // KPI rollups: only computed over the filtered list so the cards reflect
  // what the manager is currently looking at.
  let totalCents = 0;
  let totalDeliveries = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let paidCount = 0;
  for (const p of periods) {
    totalCents += p.total_cents;
    totalDeliveries += p.deliveries_count;
    if (p.status === 'PENDING') pendingCount += 1;
    else if (p.status === 'APPROVED') approvedCount += 1;
    else if (p.status === 'PAID') paidCount += 1;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Plăți curieri</h1>
          <p className="mt-1 text-sm text-hir-muted-fg">
            Pipeline de decontare: PENDING → APPROVED → PAID. {periods.length}{' '}
            perioad{periods.length === 1 ? 'ă' : 'e'} afișat{periods.length === 1 ? 'ă' : 'e'}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          icon={<Banknote className="h-4 w-4 text-emerald-400" aria-hidden />}
          label="Total"
          value={formatRon(totalCents)}
          hint={`${totalDeliveries} livrări`}
        />
        <Kpi
          icon={<Clock className="h-4 w-4 text-amber-400" aria-hidden />}
          label="În așteptare"
          value={String(pendingCount)}
          hint="PENDING"
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4 text-violet-400" aria-hidden />}
          label="Aprobate"
          value={String(approvedCount)}
          hint="APPROVED"
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />}
          label="Plătite"
          value={String(paidCount)}
          hint="PAID"
        />
      </div>

      {/* Filter chips. Use <Link> so a refresh keeps the filter and so
          search engines / accessibility tree see the relationship. */}
      <nav aria-label="Filtru status" className="flex flex-wrap gap-2">
        {(['ALL', 'PENDING', 'APPROVED', 'PAID'] as const).map((f) => {
          const active = filter === f;
          const href = f === 'ALL' ? '/fleet/payouts' : `/fleet/payouts?status=${f}`;
          return (
            <Link
              key={f}
              href={href}
              className={
                'rounded-full px-3 py-1 text-xs font-semibold ' +
                (active
                  ? 'bg-violet-500 text-white'
                  : 'border border-hir-border bg-hir-surface text-hir-muted-fg hover:bg-hir-border')
              }
            >
              {f === 'ALL' ? 'Toate' : f}
            </Link>
          );
        })}
      </nav>

      {periods.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hir-border bg-hir-surface px-4 py-8 text-center text-sm text-hir-muted-fg">
          {courierIds.length === 0
            ? 'Niciun curier în flotă încă.'
            : 'Nicio perioadă de decontare pentru acest filtru.'}
        </p>
      ) : (
        <ul className="divide-y divide-hir-border rounded-2xl border border-hir-border bg-hir-surface">
          {periods.map((p) => (
            <li key={p.id}>
              <Link
                href={`/fleet/payouts/${p.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-hir-border/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-hir-fg">
                    {courierName.get(p.courier_user_id) ?? '—'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-hir-muted-fg">
                    {formatDateRange(p.period_start, p.period_end)} ·{' '}
                    {p.deliveries_count} livrări
                    {p.payment_ref ? ` · ref ${p.payment_ref}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-emerald-300">
                    {formatRon(p.total_cents)}
                  </span>
                  <StatusBadge status={p.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-hir-muted-fg">
        Perioadele sunt create săptămânal de un cron-job. Dacă nu vezi o
        perioadă pentru săptămâna trecută, contactează platform-admin.
        <Download className="ml-2 inline h-3 w-3" aria-hidden /> Export CSV
        disponibil pe pagina fiecărei perioade.
      </p>
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
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors[status]}`}
    >
      {status}
    </span>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-hir-border bg-hir-surface p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-hir-fg">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-hir-muted-fg">{hint}</p> : null}
    </div>
  );
}
