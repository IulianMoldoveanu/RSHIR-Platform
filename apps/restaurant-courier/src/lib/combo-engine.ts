// Combo grouping engine — client-side only (server already filters pool).
//
// Per [[decision-courier-ops-dodo-pattern-2026-05-22]]:
//   - Z1 urban (0-6 km): max 3 comenzi per combo
//   - Z2-Z4 extra-urban: max 4 comenzi per combo
//   - Cluster valid if max 1.5 km between dropoff points
//
// Inputs: list of pool orders (CREATED/OFFERED, unassigned) with dropoff coords.
// Output: list of combo suggestions sorted by total fee descending.

export type PoolOrder = {
  id: string;
  zone_id: string | null;
  zone_type: 'URBAN' | 'EXTRA_URBAN' | null;
  delivery_fee_ron: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  dropoff_line1: string | null;
  customer_first_name: string | null;
};

export type ComboSuggestion = {
  id: string; // synthetic, e.g. "combo:order1+order2+order3"
  zone_label: string;
  order_ids: string[];
  total_fee_ron: number;
  estimated_minutes: number;
  // Roughly: where on the map this cluster centres (avg of dropoffs).
  center_lat: number;
  center_lng: number;
};

const MAX_CLUSTER_DISTANCE_KM = 1.5;
// Per-cluster cap by zone type.
const MAX_PER_COMBO_URBAN = 3;
const MAX_PER_COMBO_EXTRA = 4;
// Rough average speed for ETA, mixed urban traffic.
const AVG_SPEED_KMH = 25;
// Service time per stop (pickup + handoff + parking).
const STOP_MIN = 3;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Suggest combos from the current pool. Greedy clustering: pick the order
 * with most nearby siblings as the seed, attach all within 1.5 km up to the
 * zone cap, repeat with remaining orders. Returns suggestions only when
 * cluster size ≥ 2.
 *
 * `courierMaxParallel` caps each combo so a 4-slot combo doesn't violate a
 * 2-parallel courier limit.
 */
export function suggestCombos(
  orders: PoolOrder[],
  courierMaxParallel: number | null,
): ComboSuggestion[] {
  // Drop orders missing dropoff coordinates — can't cluster them.
  const candidates = orders.filter(
    (o) => o.dropoff_lat != null && o.dropoff_lng != null && o.zone_id != null,
  );
  if (candidates.length < 2) return [];

  // Group by zone first; cross-zone combos are not allowed (different pricing).
  const byZone = new Map<string, PoolOrder[]>();
  for (const o of candidates) {
    const key = o.zone_id ?? 'unknown';
    const arr = byZone.get(key) ?? [];
    arr.push(o);
    byZone.set(key, arr);
  }

  const out: ComboSuggestion[] = [];

  for (const [zoneId, zoneOrders] of byZone) {
    if (zoneOrders.length < 2) continue;

    const zoneType = zoneOrders[0]?.zone_type ?? 'URBAN';
    const baseCap = zoneType === 'URBAN' ? MAX_PER_COMBO_URBAN : MAX_PER_COMBO_EXTRA;
    const cap =
      courierMaxParallel != null ? Math.min(baseCap, courierMaxParallel) : baseCap;
    if (cap < 2) continue;

    // Track which order IDs are already in a suggested combo.
    const used = new Set<string>();

    // Sort by "how many neighbours within 1.5 km" descending — that's the
    // best seed candidate.
    const neighboursCount = new Map<string, number>();
    for (const o of zoneOrders) {
      let c = 0;
      for (const other of zoneOrders) {
        if (other.id === o.id) continue;
        const d = haversineKm(
          o.dropoff_lat as number,
          o.dropoff_lng as number,
          other.dropoff_lat as number,
          other.dropoff_lng as number,
        );
        if (d <= MAX_CLUSTER_DISTANCE_KM) c += 1;
      }
      neighboursCount.set(o.id, c);
    }
    const sorted = [...zoneOrders].sort(
      (a, b) => (neighboursCount.get(b.id) ?? 0) - (neighboursCount.get(a.id) ?? 0),
    );

    for (const seed of sorted) {
      if (used.has(seed.id)) continue;
      const cluster: PoolOrder[] = [seed];
      for (const other of sorted) {
        if (cluster.length >= cap) break;
        if (other.id === seed.id || used.has(other.id)) continue;
        const d = haversineKm(
          seed.dropoff_lat as number,
          seed.dropoff_lng as number,
          other.dropoff_lat as number,
          other.dropoff_lng as number,
        );
        if (d <= MAX_CLUSTER_DISTANCE_KM) cluster.push(other);
      }
      if (cluster.length < 2) continue;

      // Lock all into this combo.
      for (const o of cluster) used.add(o.id);

      const total = cluster.reduce(
        (s, o) => s + (o.delivery_fee_ron != null ? Number(o.delivery_fee_ron) : 0),
        0,
      );

      // ETA: ~3 min/stop + travel time between farthest two points / 2.
      // Crude but good enough for a hint.
      const maxPairDist = cluster.reduce((maxD, a) => {
        for (const b of cluster) {
          if (a.id === b.id) continue;
          const d = haversineKm(
            a.dropoff_lat as number,
            a.dropoff_lng as number,
            b.dropoff_lat as number,
            b.dropoff_lng as number,
          );
          if (d > maxD) return d;
        }
        return maxD;
      }, 0);
      const travelMin = Math.round((maxPairDist / AVG_SPEED_KMH) * 60);
      const eta = cluster.length * STOP_MIN + travelMin;

      // Centre = average dropoff.
      const lat =
        cluster.reduce((s, o) => s + (o.dropoff_lat as number), 0) / cluster.length;
      const lng =
        cluster.reduce((s, o) => s + (o.dropoff_lng as number), 0) / cluster.length;

      out.push({
        id: `combo:${cluster.map((o) => o.id).join('+')}`,
        zone_label: `${zoneType === 'URBAN' ? 'Z1' : 'Z'}` + (zoneId.slice(0, 4)),
        order_ids: cluster.map((o) => o.id),
        total_fee_ron: total,
        estimated_minutes: eta,
        center_lat: lat,
        center_lng: lng,
      });
    }
  }

  // Highest-fee combos first.
  out.sort((a, b) => b.total_fee_ron - a.total_fee_ron);
  return out;
}
