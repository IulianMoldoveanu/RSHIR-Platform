import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ShiftTimer } from './shift-timer';
import { EarningsValue } from './earnings-value';

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

  const [{ data: ordersData }, { data: shiftData }] = await Promise.all([
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
  ]);

  const orders = (ordersData ?? []) as Array<{ delivery_fee_ron: number | null }>;
  const count = orders.length;
  const earnings = orders.reduce((sum, row) => sum + (Number(row.delivery_fee_ron) || 0), 0);
  const shift = shiftData as { id: string; started_at: string | null } | null;
  const isOnline = !!shift;

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-[11px]"
      aria-label="Sumar tură curentă"
    >
      <span
        className={
          isOnline
            ? 'inline-flex items-center gap-1 text-emerald-400'
            : 'inline-flex items-center gap-1 text-zinc-500'
        }
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-zinc-600'}`}
          aria-hidden
        />
        {isOnline ? 'Online' : 'Offline'}
      </span>
      <span className="h-3 w-px bg-zinc-800" aria-hidden />
      <EarningsValue value={earnings} count={count} />
      {isOnline && shift?.started_at ? <ShiftTimer startedAt={shift.started_at} /> : null}
    </div>
  );
}
