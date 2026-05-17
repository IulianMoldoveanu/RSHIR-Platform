import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  XCircle,
} from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { VerticalBadge } from '@/components/vertical-badge';
import { EmptyState } from '@/components/empty-state';
import { cardClasses } from '@/components/card';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Istoricul curselor — HIR Curier',
};

type HistoryRow = {
  id: string;
  status: 'DELIVERED' | 'CANCELLED' | 'FAILED' | 'IN_TRANSIT' | 'PICKED_UP';
  vertical: 'restaurant' | 'pharma' | null;
  customer_first_name: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  delivery_fee_ron: number | null;
  updated_at: string | null;
};

const STATUS_COPY: Record<HistoryRow['status'], { label: string; tone: string; Icon: React.ElementType }> = {
  DELIVERED: { label: 'Livrată', tone: 'text-emerald-300', Icon: Check },
  CANCELLED: { label: 'Anulată', tone: 'text-rose-300', Icon: XCircle },
  FAILED: { label: 'Eșuată', tone: 'text-rose-300', Icon: XCircle },
  IN_TRANSIT: { label: 'În drum', tone: 'text-violet-300', Icon: Clock },
  PICKED_UP: { label: 'Ridicată', tone: 'text-violet-300', Icon: Clock },
};

function formatRoDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ro-RO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default async function TripHistoryPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Pull the most recent 100 finalised trips. Filtering by status NOT IN
  // ('CREATED', 'OFFERED', 'ACCEPTED') because those are not "history" —
  // they're either available or in-flight. Keep PICKED_UP/IN_TRANSIT so
  // a courier viewing the screen mid-shift sees the trip they're on.
  const { data } = await admin
    .from('courier_orders')
    .select(
      'id, status, vertical, customer_first_name, pickup_line1, dropoff_line1, delivery_fee_ron, updated_at',
    )
    .eq('assigned_courier_user_id', user.id)
    .in('status', ['DELIVERED', 'CANCELLED', 'FAILED', 'IN_TRANSIT', 'PICKED_UP'])
    .order('updated_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as HistoryRow[];
  const deliveredCount = rows.filter((r) => r.status === 'DELIVERED').length;
  const cancelledCount = rows.filter(
    (r) => r.status === 'CANCELLED' || r.status === 'FAILED',
  ).length;
  const finishRate =
    rows.length > 0 ? (deliveredCount / rows.length) * 100 : 0;
  const grossRon = rows
    .filter((r) => r.status === 'DELIVERED')
    .reduce((s, r) => s + (Number(r.delivery_fee_ron) || 0), 0);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/dashboard/settings"
        className="inline-flex min-h-[32px] items-center gap-1.5 self-start rounded-lg px-1 text-xs font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Setări
      </Link>

      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
          <History className="h-5 w-5 text-violet-300" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">
            Istoricul curselor
          </h1>
          <p className="mt-0.5 text-sm leading-relaxed text-hir-muted-fg">
            Ultimele 100 de comenzi cu starea finală: livrată, anulată sau eșuată.
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" aria-hidden />}
          title="Nicio cursă în istoric"
          hint="Pe măsură ce finalizezi comenzi, vor apărea aici."
          ctaHref="/dashboard"
          ctaLabel="Deschide harta"
        />
      ) : (
        <>
          {/* Summary chips */}
          <section className={cardClasses({ padding: 'md', className: 'grid grid-cols-3 gap-2' })}>
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-lg font-bold tabular-nums text-emerald-300">
                {deliveredCount}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-hir-muted-fg">
                Livrate
              </span>
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-lg font-bold tabular-nums text-hir-fg">
                {finishRate.toFixed(0)}%
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-hir-muted-fg">
                Rată finalizare
              </span>
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-lg font-bold tabular-nums text-hir-fg">
                {grossRon.toFixed(0)}
                <span className="ml-1 text-xs font-medium text-hir-muted-fg">RON</span>
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-hir-muted-fg">
                Brut
              </span>
            </div>
          </section>

          {cancelledCount > 0 ? (
            <p className="text-[11px] text-hir-muted-fg">
              {cancelledCount} comen{cancelledCount === 1 ? 'dă' : 'zi'} anulate
              sau eșuate (incluse în calculul ratei).
            </p>
          ) : null}

          <ol className="flex flex-col gap-2">
            {rows.map((row) => {
              const meta = STATUS_COPY[row.status];
              const Icon = meta.Icon;
              return (
                <li key={row.id}>
                  <Link
                    href={`/dashboard/orders/${row.id}`}
                    className={cardClasses({
                      padding: 'sm',
                      className:
                        'flex items-center gap-3 transition-colors hover:border-violet-500/40 hover:bg-hir-border/40 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2',
                    })}
                  >
                    <span
                      aria-hidden
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${
                        row.status === 'DELIVERED'
                          ? 'bg-emerald-500/15 ring-emerald-500/30'
                          : row.status === 'CANCELLED' || row.status === 'FAILED'
                            ? 'bg-rose-500/15 ring-rose-500/30'
                            : 'bg-violet-500/15 ring-violet-500/30'
                      } ${meta.tone}`}
                    >
                      <Icon
                        className="h-4 w-4"
                        strokeWidth={row.status === 'DELIVERED' ? 3 : 2.5}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-[11px] font-semibold uppercase tracking-wide ${meta.tone}`}>
                          {meta.label}
                        </p>
                        {row.vertical === 'pharma' ? (
                          <VerticalBadge vertical="pharma" />
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium text-hir-fg">
                        {row.customer_first_name ?? row.dropoff_line1 ?? 'Comandă'}
                      </p>
                      <p className="mt-0.5 text-[11px] tabular-nums text-hir-muted-fg">
                        {formatRoDateTime(row.updated_at)}
                      </p>
                    </div>
                    {row.status === 'DELIVERED' && row.delivery_fee_ron !== null ? (
                      <span className="text-sm font-semibold tabular-nums text-emerald-300">
                        +{Number(row.delivery_fee_ron).toFixed(2)}
                      </span>
                    ) : null}
                    <ChevronRight className="h-4 w-4 shrink-0 text-hir-muted-fg" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
