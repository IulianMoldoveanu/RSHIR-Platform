/**
 * Resolves an order's travelled-distance metrics.
 *
 * There are two sources and they are not interchangeable:
 *
 *   - A CLOSED order carries its numbers on the row (route_computed_at set),
 *     written once by trg_courier_orders_compute_route. Those columns are the
 *     only copy that survives the 30-day GPS purge, so a delivered order must
 *     always be read from them — never re-measured.
 *   - An IN-PROGRESS order has no stored numbers yet, so we measure live via
 *     fn_courier_order_route, whose window simply ends at now().
 *
 * Anything else — an offer nobody accepted, or a delivery that closed before
 * this feature shipped — has nothing to show, and says so by returning null.
 */

export type OrderRouteMetrics = {
  distanceM: number | null;
  pickupDistanceM: number | null;
  attributedDistanceM: number | null;
  points: number;
  /** True while the order is still open, i.e. the distance is still growing. */
  live: boolean;
};

export type OrderRouteSource = {
  id: string;
  status: string;
  route_distance_m: number | null;
  route_pickup_distance_m: number | null;
  route_attributed_distance_m: number | null;
  route_points: number | null;
  route_computed_at: string | null;
};

/** Statuses during which the courier is actively covering ground. */
const IN_PROGRESS = new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

export const ORDER_ROUTE_COLUMNS =
  'route_distance_m, route_pickup_distance_m, route_attributed_distance_m, route_points, route_computed_at';

export async function resolveOrderRoute(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  order: OrderRouteSource,
): Promise<OrderRouteMetrics | null> {
  if (order.route_computed_at) {
    return {
      distanceM: order.route_distance_m,
      pickupDistanceM: order.route_pickup_distance_m,
      attributedDistanceM: order.route_attributed_distance_m,
      points: order.route_points ?? 0,
      live: false,
    };
  }

  if (!IN_PROGRESS.has(order.status)) return null;

  // Best-effort: a metrics panel must never be the reason an order page 500s.
  try {
    const { data, error } = await admin.rpc('fn_courier_order_route', {
      p_order_id: order.id,
    });
    if (error || !data) return null;
    const row = data as {
      points?: number;
      distance_m?: number | null;
      pickup_distance_m?: number | null;
      attributed_distance_m?: number | null;
    };
    return {
      distanceM: row.distance_m ?? null,
      pickupDistanceM: row.pickup_distance_m ?? null,
      attributedDistanceM: row.attributed_distance_m ?? null,
      points: row.points ?? 0,
      live: true,
    };
  } catch {
    return null;
  }
}
