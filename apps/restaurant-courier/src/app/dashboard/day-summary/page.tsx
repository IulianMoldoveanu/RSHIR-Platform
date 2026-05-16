import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Banknote, Clock, MapPin, Package, Star, ChevronRight, Home } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ConfettiBurst } from './confetti-burst';

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

  const [{ data: shiftData }, { data: deliveryData }] = await Promise.all([
    admin
      .from('courier_shifts')
      .select('id, started_at, ended_at, courier_user_id')
      .eq('id', shiftId)
      .maybeSingle(),
    admin
      .from('courier_orders')
      .select('id, delivery_fee_ron, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, dropoff_line1')
      .eq('assigned_courier_user_id', user.id)
      .eq('status', 'DELIVERED')
      .gte(
        'updated_at',
        // We need the shift's started_at — if data isn't loaded yet we'll
        // filter in JS below. Use a loose epoch as the fallback.
        new Date(0).toISOString(),
      ),
  ]);

  const shift = shiftData as ShiftRow | null;
  if (!shift) notFound();
  // IDOR guard: only the courier who ran the shift may view the summary.
  if (shift.courier_user_id !== user.id) notFound();

  const allDeliveries = (deliveryData ?? []) as DeliveredRow[];
  // Filter to deliveries completed within this shift's time window.
  const shiftDeliveries = allDeliveries; // courier_orders already filtered by user + DELIVERED

  // Re-fetch bounded to shift window for accuracy (two queries to avoid
  // computing started_at before the shift fetch resolves).
  const { data: shiftBoundData } = await admin
    .from('courier_orders')
    .select('id, delivery_fee_ron, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, dropoff_line1')
    .eq('assigned_courier_user_id', user.id)
    .eq('status', 'DELIVERED')
    .gte('updated_at', shift.started_at)
    .lte('updated_at', shift.ended_at ?? new Date().toISOString());

  const deliveries = (shiftBoundData ?? shiftDeliveries) as DeliveredRow[];

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
      return sum + haversineMeters(d.pickup_lat, d.pickup_lng, d.dropoff_lat, d.dropoff_lng) / 1_000;
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
            (Number(d.delivery_fee_ron) || 0) > (Number(best.delivery_fee_ron) || 0) ? d : best,
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
            Sumar tură — {shiftDate}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-hir-fg">
            {deliveryCount > 0 ? 'Tura s-a incheiat.' : 'Tură finalizată.'}
          </h1>
          {deliveryCount > 0 ? (
            <p className="mt-1 text-sm text-hir-muted-fg">
              Felicitari pentru munca de azi!
            </p>
          ) : null}
        </div>

        {/* Main stats card */}
        <section className="rounded-2xl border border-hir-border bg-hir-surface p-5">
          <div className="grid grid-cols-2 gap-4">
            <StatBlock
              icon={<Banknote className="h-5 w-5 text-emerald-400" aria-hidden />}
              label="Castig brut"
              value={`${totalEarnings.toFixed(2)} RON`}
              highlight
            />
            <StatBlock
              icon={<Package className="h-5 w-5 text-violet-400" aria-hidden />}
              label="Livrari"
              value={String(deliveryCount)}
            />
            <StatBlock
              icon={<MapPin className="h-5 w-5 text-blue-400" aria-hidden />}
              label="Km estimati"
              value={`${totalKm.toFixed(1)} km`}
            />
            <StatBlock
              icon={<Clock className="h-5 w-5 text-hir-muted-fg" aria-hidden />}
              label="Ore active"
              value={`${totalHours.toFixed(1)} h`}
            />
          </div>

          {deliveryCount > 0 && totalHours > 0 ? (
            <div className="mt-4 flex items-center justify-between border-t border-hir-border pt-4 text-sm">
              <span className="text-hir-muted-fg">Castig / ora</span>
              <span className="font-semibold text-hir-fg">
                {(totalEarnings / totalHours).toFixed(2)} RON/h
              </span>
            </div>
          ) : null}
        </section>

        {/* Best delivery */}
        {bestDelivery && Number(bestDelivery.delivery_fee_ron) > 0 ? (
          <section className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                <Star className="h-4 w-4 text-amber-400" aria-hidden />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">
                Cea mai buna livrare
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="truncate text-sm text-hir-fg">
                {bestDelivery.dropoff_line1 ?? 'Adresa necunoscuta'}
              </p>
              <span className="ml-3 shrink-0 font-semibold text-amber-300">
                {Number(bestDelivery.delivery_fee_ron).toFixed(2)} RON
              </span>
            </div>
          </section>
        ) : null}

        {/* Empty state */}
        {deliveryCount === 0 ? (
          <section className="rounded-2xl border border-hir-border bg-hir-surface p-6 text-center">
            <p className="text-sm text-hir-muted-fg">
              Nicio livrare finalizata in aceasta tura.
            </p>
          </section>
        ) : null}

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard/shift"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 text-sm font-semibold text-white hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            Continua cu o tura noua
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/dashboard"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-hir-border bg-hir-surface px-6 text-sm font-semibold text-hir-fg hover:border-violet-500/60 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <Home className="h-4 w-4" aria-hidden />
            Mergi acasa
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
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          {label}
        </span>
      </div>
      <span
        className={`text-xl font-bold ${highlight ? 'text-emerald-300' : 'text-hir-fg'}`}
      >
        {value}
      </span>
    </div>
  );
}
