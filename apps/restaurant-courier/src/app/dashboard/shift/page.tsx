import { Button, Card, CardContent, CardHeader, CardTitle } from '@hir/ui';
import { Banknote, Clock, TrendingUp } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startShiftAction, endShiftAction } from '../actions';

export const dynamic = 'force-dynamic';

type ShiftRow = { id: string; started_at: string };

type DeliveredRow = { delivery_fee_ron: number | null; updated_at: string };

export default async function ShiftPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const { data: shiftRow } = await admin
    .from('courier_shifts')
    .select('id, started_at')
    .eq('courier_user_id', user.id)
    .eq('status', 'ONLINE')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const active = shiftRow as ShiftRow | null;

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
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Tură</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {active ? (
            <>
              <p className="text-sm text-emerald-700">
                Ești <strong>online</strong> de la{' '}
                {new Date(active.started_at).toLocaleTimeString('ro-RO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                .
              </p>
              <form action={endShiftAction}>
                <Button type="submit" className="w-full" variant="outline">
                  Închide tura
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-600">
                Pornește tura pentru a primi comenzi.
              </p>
              <form action={startShiftAction}>
                <Button type="submit" className="w-full">
                  Pornește tura
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      {stats ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-zinc-600">Tură curentă</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            <Stat
              icon={<Banknote className="h-4 w-4 text-emerald-600" aria-hidden />}
              label="Câștig"
              value={`${stats.earnings.toFixed(2)} RON`}
            />
            <Stat
              icon={<TrendingUp className="h-4 w-4 text-violet-600" aria-hidden />}
              label="RON/oră"
              value={stats.perHour > 0 ? stats.perHour.toFixed(2) : '—'}
            />
            <Stat
              icon={<Clock className="h-4 w-4 text-zinc-500" aria-hidden />}
              label="Livrări"
              value={String(stats.count)}
            />
          </CardContent>
        </Card>
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
    <div className="flex flex-col items-center gap-1">
      <span aria-hidden>{icon}</span>
      <span className="text-base font-semibold text-zinc-900">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
    </div>
  );
}
