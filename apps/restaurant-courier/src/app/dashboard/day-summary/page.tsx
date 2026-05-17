import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Banknote, Clock, MapPin, Package, Star, ChevronRight, Home } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ConfettiBurst } from './confetti-burst';
import { cardClasses } from '@/components/card';

export const dynamic = 'force-dynamic';

type ShiftRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  courier_user_id: string;
};

type DeliveredRow = {
  id: string;
  delivery_fee_ron: number | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  dropoff_line1: string | null;
};

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * End-of-shift day summary. Shown automatically after the courier ends
 * their shift via the swipe button on /dashboard/shift.
 *
 * Query: /dashboard/day-summary?shiftId=<uuid>
 *
 * SECURITY: fetches the shift and verifies courier_user_id === auth user.
 * A missing or mismatched shiftId returns 404 — no PII leak.
 *
 * NO SCHEMA CHANGES. Uses existing courier_shifts + courier_orders data.
 */
export default async function DaySummaryPage(props: {
  searchParams: Promise<{ shiftId?: string }>;
}) {
  const { shiftId } = await props.searchParams;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (!shiftId) notFound();

  const admin = createAdminClient();

  const { data: shiftData } = await admin
    .from('courier_shifts')
    .select('id, started_at, ended_at, courier_user_id')
    .eq('id', shiftId)
    .maybeSingle();

  const shift = shiftData as ShiftRow | null;
  if (!shift) notFound();
  // IDOR guard: only the courier who ran the shift may view the summary.
  if (shift.courier_user_id !== user.id) notFound();

  // Fetch deliveries bounded to the shift's time window.
  const { data: shiftBoundData } = await admin
    .from('courier_orders')
    .select(
      'id, delivery_fee_ron, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, dropoff_line1',
    )
    .eq('assigned_courier_user_id', user.id)
    .eq('status', 'DELIVERED')
    .gte('updated_at', shift.started_at)
    .lte('updated_at', shift.ended_at ?? new Date().toISOString());

  const deliveries = (shiftBoundData ?? []) as DeliveredRow[];

  // Compute stats.
  const totalEarnings = deliveries.reduce(
    (sum, d) => sum + (Number(d.delivery_fee_ron) || 0),
    0,
  );

  const deliveryCount = deliveries.length;

  // Estimated km: sum of straight-line pickup→dropoff distances per delivery.
  // This underestimates real road distance but gives a meaningful proxy.
  const totalKm = deliveries.reduce((sum, d) => {
    if (
      d.pickup_lat != null &&
      d.pickup_lng != null &&
      d.dropoff_lat != null &&
      d.dropoff_lng != null
    ) {
      return (
        sum +
        haversineMeters(d.pickup_lat, d.pickup_lng, d.dropoff_lat, d.dropoff_lng) /
          1_000
      );
    }
    return sum;
  }, 0);

  // Total active hours (shift duration, not driving time).
  const startMs = new Date(shift.started_at).getTime();
  const endMs = shift.ended_at ? new Date(shift.ended_at).getTime() : Date.now();
  const totalHours = Math.max(0, (endMs - startMs) / 3_600_000);

  // Best delivery: highest delivery fee.
  const bestDelivery =
    deliveries.length > 0
      ? deliveries.reduce<DeliveredRow>(
          (best, d) =>
            (Number(d.delivery_fee_ron) || 0) > (Number(best.delivery_fee_ron) || 0)
              ? d
              : best,
          deliveries[0],
        )
      : null;

  const shiftDate = new Date(shift.started_at).toLocaleDateString('ro-RO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <>
      {deliveryCount > 0 ? <ConfettiBurst /> : null}

      <div className="mx-auto flex max-w-xl flex-col gap-5">
        {/* Header */}
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            Sumar tură · {shiftDate}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-hir-fg">
            {deliveryCount > 0 ? 'Tura s-a încheiat' : 'Tură finalizată'}
          </h1>
          {deliveryCount > 0 ? (
            <p className="mt-1 text-sm text-hir-muted-fg">
              Felicitări pentru munca de azi!
            </p>
          ) : null}
        </div>

        {/* Hero earnings card — visually dominant on success */}
        {deliveryCount > 0 ? (
          <section
            className={cardClasses({
              padding: 'lg',
              className:
                'border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-hir-surface text-center',
            })}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
              Câștig brut
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-emerald-200">
              {totalEarnings.toFixed(2)}
              <span className="ml-1 text-xl font-semibold text-emerald-300/80">RON</span>
            </p>
            {totalHours > 0 ? (
              <p className="mt-2 text-xs tabular-nums text-hir-muted-fg">
                ≈ {(totalEarnings / totalHours).toFixed(2)} RON / oră
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Stats grid (delivery count + km + hours) */}
        <section className={cardClasses({ padding: 'lg' })}>
          <div className="grid grid-cols-3 gap-4">
            <StatBlock
              icon={<Package className="h-5 w-5 text-violet-300" aria-hidden />}
              label="Livrări"
              value={String(deliveryCount)}
            />
            <StatBlock
              icon={<MapPin className="h-5 w-5 text-blue-300" aria-hidden />}
              label="Km estimați"
              value={`${totalKm.toFixed(1)}`}
              suffix="km"
            />
            <StatBlock
              icon={<Clock className="h-5 w-5 text-hir-muted-fg" aria-hidden />}
              label="Ore active"
              value={totalHours.toFixed(1)}
              suffix="h"
            />
          </div>
        </section>

        {/* Best delivery */}
        {bestDelivery && Number(bestDelivery.delivery_fee_ron) > 0 ? (
          <section
            className={cardClasses({
              padding: 'lg',
              variant: 'warning',
              className: 'bg-gradient-to-br from-amber-500/10 to-amber-950/20',
            })}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-500/40">
                <Star
                  className="h-3.5 w-3.5 text-amber-300"
                  aria-hidden
                  strokeWidth={2.5}
                />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                Cea mai bună livrare
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate text-sm text-hir-fg">
                {bestDelivery.dropoff_line1 ?? 'Adresă necunoscută'}
              </p>
              <span className="shrink-0 text-base font-semibold tabular-nums text-amber-200">
                {Number(bestDelivery.delivery_fee_ron).toFixed(2)} RON
              </span>
            </div>
          </section>
        ) : null}

        {/* Empty state */}
        {deliveryCount === 0 ? (
          <section
            className={cardClasses({ padding: 'lg', className: 'text-center' })}
          >
            <p className="text-sm text-hir-muted-fg">
              Nicio livrare finalizată în această tură.
            </p>
          </section>
        ) : null}

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard/shift"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:bg-violet-500 hover:shadow-violet-500/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2"
          >
            Continuă cu o tură nouă
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/dashboard"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-hir-border bg-hir-surface px-6 text-sm font-medium text-hir-fg transition-colors hover:border-violet-500/60 hover:bg-hir-border/40 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <Home className="h-4 w-4" aria-hidden />
            Mergi acasă
          </Link>
        </div>
      </div>
    </>
  );
}

function StatBlock({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <span aria-hidden>{icon}</span>
      <span className="text-lg font-bold tabular-nums text-hir-fg">
        {value}
        {suffix ? (
          <span className="ml-0.5 text-xs font-medium text-hir-muted-fg">
            {suffix}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-hir-muted-fg">
        {label}
      </span>
    </div>
  );
}
