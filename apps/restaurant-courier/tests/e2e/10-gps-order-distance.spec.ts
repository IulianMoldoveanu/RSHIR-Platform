import { test, expect } from '@playwright/test';
import {
  seedCourier,
  seedOrder,
  cleanupOrder,
  cleanupAssignedOrdersForCourier,
  endAnyOpenShift,
  adminSupabase,
} from './fixtures/seed';
import { loginAsTestCourier, holdSwipeButton } from './helpers/auth';

// Every other test of the route metrics proves one link of the chain: the SQL
// suites prove the arithmetic, 08 proves a browser reaches record_courier_ping.
// None of them proves the whole thing joins up — that a courier who actually
// drives ends up with a number on their card.
//
// This closes the loop end to end: real browser, real geolocation permission,
// real shift, real order lifecycle, and then the distance read back both from
// the materialised column and from the rendered page.

/** Metres between two WGS84 points. Mirrors fn_haversine_m. */
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Three points ~400 m apart along a line north from Braşov centre.
//
// The leg length is not arbitrary. Fixes are forwarded at most once per 30s,
// so each leg is also a speed claim: 400 m / 30 s ≈ 48 km/h, comfortably under
// the 150 km/h ceiling above which fn_courier_order_route treats a jump as a
// GPS teleport and drops it. An earlier draft used 500 m legs and, because the
// emulator delivers them the instant the position is set, claimed 295 km/h —
// the route was correctly measured as unmeasurable and the test failed on the
// feature working exactly as designed.
const LEG = 0.0036; // ~400 m of latitude
const P0 = { latitude: 45.6427, longitude: 25.5887 };
const P1 = { latitude: P0.latitude + LEG, longitude: P0.longitude };
const P2 = { latitude: P0.latitude + 2 * LEG, longitude: P0.longitude };

async function trailLength(userId: string): Promise<number> {
  const { data } = await adminSupabase
    .from('courier_location_pings')
    .select('lat, lng')
    .eq('courier_user_id', userId)
    .order('recorded_at', { ascending: true });
  const pts = (data ?? []) as { lat: number; lng: number }[];
  return pts.length;
}

test.describe('Order distance, end to end', () => {
  let userId: string;
  let fleetId: string;
  let orderId: string;
  let customerName: string;

  test.beforeEach(async () => {
    const seeded = await seedCourier();
    userId = seeded.userId;
    fleetId = seeded.fleetId;
    await endAnyOpenShift(userId);
    await cleanupAssignedOrdersForCourier(userId);
    await adminSupabase.from('courier_location_pings').delete().eq('courier_user_id', userId);

    const order = await seedOrder(fleetId);
    orderId = order.orderId;
    customerName = order.customerName;
  });

  test.afterEach(async () => {
    await cleanupOrder(orderId);
    await endAnyOpenShift(userId);
  });

  test('a courier who drives gets a measured distance on the card', async ({ page, context }) => {
    // Two 30s throttle windows, login, and the lifecycle swipes.
    test.setTimeout(300_000);

    await context.setGeolocation({ ...P0, accuracy: 10 });
    await loginAsTestCourier(page);
    await holdSwipeButton(page, /glisează|porni tura|pornește tura|start/i);
    await expect(page.getByText(/online/i).first()).toBeVisible({ timeout: 30_000 });

    // Wait for the go-online fix so the trail has a starting point BEFORE the
    // order opens its window — otherwise the first leg has nothing to measure
    // from and the test would pass for the wrong reason.
    await expect
      .poll(() => trailLength(userId), { timeout: 90_000, intervals: [2_000] })
      .toBeGreaterThanOrEqual(1);

    // Hand the order over exactly as dispatch does: assignee + ACCEPTED in one
    // update, so the assignment trigger stamps courier_accepted_at itself
    // rather than the test asserting its own idea of when work began.
    await adminSupabase
      .from('courier_orders')
      .update({ status: 'ACCEPTED', assigned_courier_user_id: userId })
      .eq('id', orderId);

    const { data: stamped } = await adminSupabase
      .from('courier_orders')
      .select('courier_accepted_at')
      .eq('id', orderId)
      .maybeSingle();
    expect(stamped?.courier_accepted_at).toBeTruthy();

    // Leg 1: drive to the restaurant.
    await context.setGeolocation({ ...P1, accuracy: 10 });
    await expect
      .poll(() => trailLength(userId), { timeout: 90_000, intervals: [2_000] })
      .toBeGreaterThanOrEqual(2);

    await page.goto(`/dashboard/orders/${orderId}`);
    await holdSwipeButton(page, /Glisează pentru a confirma ridicare/i);
    await expect
      .poll(
        async () => {
          const { data } = await adminSupabase
            .from('courier_orders')
            .select('status')
            .eq('id', orderId)
            .maybeSingle();
          return data?.status;
        },
        { timeout: 20_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe('PICKED_UP');

    // Leg 2: drive to the customer.
    await context.setGeolocation({ ...P2, accuracy: 10 });
    await expect
      .poll(() => trailLength(userId), { timeout: 90_000, intervals: [2_000] })
      .toBeGreaterThanOrEqual(3);

    // Close the order the way the deliver action does. The swipe itself is
    // covered by 06; what matters here is that closing materialises the route.
    await adminSupabase
      .from('courier_orders')
      .update({ status: 'DELIVERED', delivered_at: new Date().toISOString() })
      .eq('id', orderId);

    const { data: closed } = await adminSupabase
      .from('courier_orders')
      .select(
        'route_distance_m, route_pickup_distance_m, route_attributed_distance_m, route_points, route_computed_at',
      )
      .eq('id', orderId)
      .maybeSingle();

    // Materialised on close, so the number survives the 30-day GPS purge.
    expect(closed?.route_computed_at).toBeTruthy();
    expect(closed?.route_points).toBeGreaterThanOrEqual(2);

    // Two ~500 m legs. Allow a wide band: the emulated fix can land early and
    // the go-online point may sit a little before the window opens.
    const expected = haversineM(P0.latitude, P0.longitude, P2.latitude, P2.longitude);
    expect(closed!.route_distance_m).toBeGreaterThan(expected * 0.5);
    expect(closed!.route_distance_m).toBeLessThan(expected * 1.5);

    // Carried alone, so the payable distance is the whole distance.
    expect(closed!.route_attributed_distance_m).toBe(closed!.route_distance_m);

    // And finally the part the courier actually sees.
    await page.goto(`/dashboard/orders/${orderId}`);
    await expect(page.getByText(/Distanță parcursă/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/\d[\d.,]*\s*(m|km)\b/).first()).toBeVisible();
  });
});
