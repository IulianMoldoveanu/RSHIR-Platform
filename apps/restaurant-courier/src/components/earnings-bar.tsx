import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ShiftTimer } from './shift-timer';
import { EarningsValue } from './earnings-value';
import { Target } from 'lucide-react';

/**
 * Always-visible header pill. Shows today's net earnings, today's delivery
 * count, and the current shift status. MVP-grade: sums `delivery_fee_ron`
 * from delivered orders for "today" (Bucharest local).
 *
 * Rendered server-side and revalidated by parent route's `force-dynamic`.
 */
export async function EarningsBar() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // "Today" boundary — local server time. Good enough for MVP.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Trailing-7-day window for daily average comparison.
  const start7d = new Date(startOfDay);
  start7d.setDate(start7d.getDate() - 7);

  const [{ data: ordersData }, { data: shiftData }, { data: trailing7Data }] = await Promise.all([
    admin
      .from('courier_orders')
      .select('delivery_fee_ron')
      .eq('assigned_courier_user_id', user.id)
      .eq('status', 'DELIVERED')
      .gte('updated_at', startOfDay.toISOString()),
    admin
      .from('courier_shifts')
      .select('id, started_at')
      .eq('courier_user_id', user.id)
      .eq('status', 'ONLINE')
      .limit(1)
      .maybeSingle(),
    admin
      .from('courier_orders')
      .select('delivery_fee_ron, updated_at')
      .eq('assigned_courier_user_id', user.id)
      .eq('status', 'DELIVERED')
      .gte('updated_at', start7d.toISOString())
      .lt('updated_at', startOfDay.toISOString()),
  ]);

  const orders = (ordersData ?? []) as Array<{ delivery_fee_ron: number | null }>;
  const count = orders.length;
  const earnings = orders.reduce((sum, row) => sum + (Number(row.delivery_fee_ron) || 0), 0);
  const shift = shiftData as { id: string; started_at: string | null } | null;
  const isOnline = !!shift;

  // Compute trailing-7d daily average for micro-copy hint.
  const trailing7 = (trailing7Data ?? []) as Array<{ delivery_fee_ron: number | null; updated_at: string }>;
  const daySet = new Set<string>();
  let trailing7Total = 0;
  for (const r of trailing7) {
    const d = new Date(r.updated_at);
    daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    trailing7Total += Number(r.delivery_fee_ron) || 0;
  }
  const avgDaily = daySet.size > 0 ? trailing7Total / daySet.size : 0;
  // Gap to daily target. Positive = below average (show hint). Zero days of
  // trailing data means no hint (avgDaily === 0).
  const gapToAvg = avgDaily > 0 && earnings < avgDaily ? avgDaily - earnings : 0;

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-hir-border bg-hir-surface/80 px-3 py-1.5 text-[11px] backdrop-blur ring-1 ring-inset ring-hir-border/40"
      aria-label="Sumar tură curentă"
    >
      <span
        className={
          isOnline
            ? 'inline-flex items-center gap-1 font-medium text-emerald-300'
            : 'inline-flex items-center gap-1 font-medium text-hir-muted-fg'
        }
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-zinc-600'}`}
          aria-hidden
        />
        {isOnline ? 'Online' : 'Offline'}
      </span>
      <span className="h-3 w-px bg-hir-border" aria-hidden />
      <EarningsValue value={earnings} count={count} />
      {gapToAvg > 0 ? (
        <>
          <span className="h-3 w-px bg-hir-border" aria-hidden />
          <span
            className="flex items-center gap-1 tabular-nums text-hir-muted-fg"
            aria-label={`${gapToAvg.toFixed(2)} RON mai mult pentru target zilnic`}
          >
            <Target
              className="h-3 w-3 shrink-0 text-amber-300"
              aria-hidden
              strokeWidth={2.25}
            />
            <span>{gapToAvg.toFixed(2)} pt. target</span>
          </span>
        </>
      ) : null}
      {isOnline && shift?.started_at ? <ShiftTimer startedAt={shift.started_at} /> : null}
    </div>
  );
}
