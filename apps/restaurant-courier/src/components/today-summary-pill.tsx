import { Coins, Package, Timer } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cardClasses } from './card';

type DeliveredRow = { delivery_fee_ron: number | null; updated_at: string };

/**
 * Compact "today so far" summary, rendered at the top of /dashboard/orders.
 *
 * Three numbers: delivered count, gross earnings (RON), and a relative
 * "ultima livrare" timestamp. The existing <EarningsBar /> in the header
 * carries the running total too, but on the orders page the courier wants
 * a fuller "where am I today" anchor before scrolling through the lists.
 *
 * Pure server component. Re-uses the same Bucharest-local-day boundary as
 * EarningsBar so the numbers never diverge.
 */
export async function TodaySummaryPill() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data } = await admin
    .from('courier_orders')
    .select('delivery_fee_ron, updated_at')
    .eq('assigned_courier_user_id', user.id)
    .eq('status', 'DELIVERED')
    .gte('updated_at', startOfDay.toISOString())
    .order('updated_at', { ascending: false });

  const rows = (data ?? []) as DeliveredRow[];
  if (rows.length === 0) return null;

  const count = rows.length;
  const earnings = rows.reduce(
    (s, r) => s + (Number(r.delivery_fee_ron) || 0),
    0,
  );
  const lastDelivery = rows[0].updated_at ? new Date(rows[0].updated_at) : null;
  const minutesAgo = lastDelivery
    ? Math.floor((Date.now() - lastDelivery.getTime()) / 60_000)
    : null;

  return (
    <section
      aria-label="Sumar de azi"
      className={cardClasses({ padding: 'sm', className: 'grid grid-cols-3 gap-2' })}
    >
      <Cell
        icon={<Package className="h-4 w-4 text-violet-400" />}
        value={String(count)}
        label={count === 1 ? 'livrare azi' : 'livrări azi'}
      />
      <Cell
        icon={<Coins className="h-4 w-4 text-emerald-400" />}
        value={earnings.toFixed(2)}
        label="RON brut"
      />
      <Cell
        icon={<Timer className="h-4 w-4 text-amber-400" />}
        value={
          minutesAgo === null
            ? '—'
            : minutesAgo < 1
              ? 'acum'
              : minutesAgo < 60
                ? `${minutesAgo}m`
                : `${Math.floor(minutesAgo / 60)}h`
        }
        label="ultima livrare"
      />
    </section>
  );
}

function Cell({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-1.5 text-center">
      <span aria-hidden className="mb-0.5">
        {icon}
      </span>
      <span className="text-base font-bold tabular-nums text-hir-fg">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-hir-muted-fg">
        {label}
      </span>
    </div>
  );
}
