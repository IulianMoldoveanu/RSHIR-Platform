import { Route } from 'lucide-react';
import { formatDistanceM, formatDurationMs, elapsedMs } from '@hir/ui';
import { cardClasses } from '@/components/card';
import type { OrderRouteMetrics } from '@/lib/order-route';

type Props = {
  route: OrderRouteMetrics;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  /**
   * delivered_at ?? cancelled_at — when the clock stopped. Null only while the
   * order is genuinely still running: a cancelled order has no delivered_at,
   * and falling back to render time there would show a "total" that grew every
   * time someone opened the page.
   */
  closedAt: string | null;
  /**
   * Fleet + platform views get the batching split; the courier's own card
   * does not, because "you drove 5 km but only 2.5 count" is a payout
   * conversation, not a delivery one.
   */
  showAttributed?: boolean;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-hir-muted-fg">{label}</span>
      <span className="font-semibold tabular-nums text-hir-fg">{value}</span>
    </div>
  );
}

/**
 * Distance + time actually spent on one order, measured from the courier's
 * GPS trail rather than estimated from the straight line between two pins.
 */
export function RouteStats({
  route,
  acceptedAt,
  pickedUpAt,
  closedAt,
  showAttributed = false,
}: Props) {
  // Only a running order may be measured against the wall clock.
  const stopAt = closedAt ?? (route.live ? new Date().toISOString() : null);
  const totalMs = elapsedMs(acceptedAt, stopAt);
  const toPickupMs = elapsedMs(acceptedAt, pickedUpAt);

  // Fewer than two usable fixes is not a short trip — it is no measurement at
  // all. Saying "0 m" would be a lie a fleet manager might act on.
  const measured = route.points >= 2 && route.distanceM != null;

  // Only worth explaining when it actually happened.
  const batched =
    showAttributed &&
    measured &&
    route.attributedDistanceM != null &&
    route.attributedDistanceM < (route.distanceM ?? 0);

  return (
    <section className={cardClasses({ className: 'text-sm' })}>
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        <Route className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        Traseu {route.live ? '· în curs' : ''}
      </p>

      {measured ? (
        <div className="space-y-1.5">
          <Row
            label={route.live ? 'Distanță parcursă până acum' : 'Distanță parcursă'}
            value={formatDistanceM(route.distanceM)}
          />
          {route.pickupDistanceM != null && pickedUpAt ? (
            <Row label="Până la ridicare" value={formatDistanceM(route.pickupDistanceM)} />
          ) : null}
          {batched ? (
            <>
              <Row
                label="Alocat acestei comenzi"
                value={formatDistanceM(route.attributedDistanceM)}
              />
              <p className="pt-1 text-[11px] leading-snug text-hir-muted-fg">
                Ai dus mai multe comenzi în paralel, deci drumul comun se împarte
                între ele. Suma pe toate comenzile dă exact distanța reală.
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] leading-snug text-hir-muted-fg">
          Fără suficiente puncte GPS pentru a măsura traseul. Verifică dacă
          permisiunea de locație este activă în timpul turei.
        </p>
      )}

      <div className="mt-3 space-y-1.5 border-t border-hir-border/60 pt-3 text-xs">
        <Row
          label={route.live ? 'Timp de la acceptare' : 'Timp total'}
          value={formatDurationMs(totalMs)}
        />
        {toPickupMs != null ? (
          <Row label="Până la ridicare" value={formatDurationMs(toPickupMs)} />
        ) : null}
      </div>
    </section>
  );
}
