import { Banknote, Clock, TrendingUp } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startShiftAction, endShiftAction, forceEndShiftAction } from '../actions';
import { SwipeButton } from '@/components/swipe-button';
import { ForceEndShift } from '@/components/force-end-shift';
import { StartShiftSection } from './start-shift-section';
import { LongShiftWarning } from '@/components/long-shift-warning';
import { cardClasses } from '@/components/card';

export const dynamic = 'force-dynamic';

type ShiftRow = { id: string; started_at: string };

type DeliveredRow = { delivery_fee_ron: number | null; updated_at: string };

export default async function ShiftPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [{ data: shiftRow }, { count: activeOrderCountRaw }] = await Promise.all([
    admin
      .from('courier_shifts')
      .select('id, started_at')
      .eq('courier_user_id', user.id)
      .eq('status', 'ONLINE')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('courier_orders')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_courier_user_id', user.id)
      .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']),
  ]);
  const active = shiftRow as ShiftRow | null;
  const activeOrderCount = activeOrderCountRaw ?? 0;

  let stats: { count: number; earnings: number; perHour: number; minutes: number } | null = null;

  if (active) {
    const { data: deliveriesData } = await admin
      .from('courier_orders')
      .select('delivery_fee_ron, updated_at')
      .eq('assigned_courier_user_id', user.id)
      .eq('status', 'DELIVERED')
      .gte('updated_at', active.started_at);

    const deliveries = (deliveriesData ?? []) as DeliveredRow[];
    const earnings = deliveries.reduce(
      (sum, row) => sum + (Number(row.delivery_fee_ron) || 0),
      0,
    );
    const minutes = Math.max(
      1,
      Math.floor((Date.now() - new Date(active.started_at).getTime()) / 60_000),
    );
    const perHour = (earnings / minutes) * 60;
    stats = { count: deliveries.length, earnings, perHour, minutes };
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <section className={cardClasses({ padding: 'lg' })}>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-base font-semibold text-hir-fg">Tură</h1>
          <span
            className={
              active
                ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300'
                : 'inline-flex items-center gap-1.5 rounded-full bg-hir-border px-2.5 py-1 text-[11px] font-semibold text-hir-muted-fg'
            }
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-zinc-600'}`}
            />
            {active ? 'Online' : 'Offline'}
          </span>
        </div>

        {active ? (
          <>
            <p className="mb-4 text-sm text-hir-muted-fg">
              Online de la{' '}
              <strong className="font-semibold text-hir-fg">
                {new Date(active.started_at).toLocaleTimeString('ro-RO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </p>
            <div className="mb-3">
              <LongShiftWarning startedAt={active.started_at} />
            </div>
            <SwipeButton
              label="→ Glisează pentru a închide tura"
              onConfirm={endShiftAction}
            />
            {activeOrderCount > 0 ? (
              <div className="mt-6 border-t border-hir-border pt-4">
                <ForceEndShift
                  activeOrderCount={activeOrderCount}
                  onForceEnd={forceEndShiftAction}
                />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-hir-muted-fg">
              Pornește tura pentru a primi comenzi.
            </p>
            <StartShiftSection startShiftAction={startShiftAction} />
          </>
        )}
      </section>

      {stats ? (
        <section className={cardClasses({ padding: 'lg' })}>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            Statistici tură curentă
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <Stat
              icon={<Banknote className="h-5 w-5 text-emerald-400" aria-hidden />}
              label="Câștig"
              value={`${stats.earnings.toFixed(2)} RON`}
            />
            <Stat
              icon={<TrendingUp className="h-5 w-5 text-violet-400" aria-hidden />}
              label="RON/oră"
              value={stats.perHour > 0 ? stats.perHour.toFixed(2) : '—'}
            />
            <Stat
              icon={<Clock className="h-5 w-5 text-hir-muted-fg" aria-hidden />}
              label="Livrări"
              value={String(stats.count)}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span aria-hidden>{icon}</span>
      <span className="text-base font-bold text-hir-fg">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-hir-muted-fg">{label}</span>
    </div>
  );
}
