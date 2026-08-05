import { test, expect } from '@playwright/test';
import { seedCourier, endAnyOpenShift, adminSupabase } from './fixtures/seed';
import { loginAsTestCourier, holdSwipeButton } from './helpers/auth';

// The distance trail behind courier_orders.route_* is measured from
// courier_location_pings, and every other test of it has been server-side.
// This one drives the part that only a browser can prove: that a real shift,
// with a real geolocation permission, actually reaches record_courier_ping —
// carrying the accuracy the trail filter depends on.
//
// It also asserts the two rules that make the trail trustworthy, against the
// live database rather than a fixture:
//   * a fix where the courier has not really moved is NOT stored (GPS jitter
//     must never invent distance), while presence is still refreshed so
//     dispatch keeps seeing them;
//   * a fix after real movement IS stored, at the right distance.

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

type Ping = { lat: number; lng: number; accuracy_m: number | null; recorded_at: string };

async function trail(userId: string): Promise<Ping[]> {
  const { data } = await adminSupabase
    .from('courier_location_pings')
    .select('lat, lng, accuracy_m, recorded_at')
    .eq('courier_user_id', userId)
    .order('recorded_at', { ascending: true });
  return (data ?? []) as Ping[];
}

// Braşov centre, then ~5 m away (jitter), then ~450 m north (real movement).
const START = { latitude: 45.6427, longitude: 25.5887 };
const JITTER = { latitude: 45.642745, longitude: 25.5887 };
const MOVED = { latitude: 45.6467, longitude: 25.5887 };

test.describe('GPS trail (live)', () => {
  let userId: string;

  test.beforeEach(async () => {
    const seeded = await seedCourier();
    userId = seeded.userId;
    await endAnyOpenShift(userId);
    // Start from an empty trail so counts mean what they say.
    await adminSupabase.from('courier_location_pings').delete().eq('courier_user_id', userId);
  });

  test.afterEach(async () => {
    await endAnyOpenShift(userId);
  });

  test('a real shift records an accurate, jitter-free trail', async ({ page, context }) => {
    // Two throttle windows plus login; the tracker forwards at most one fix
    // every 30s.
    test.setTimeout(240_000);

    await context.setGeolocation({ ...START, accuracy: 10 });
    await loginAsTestCourier(page);

    await holdSwipeButton(page, /glisează|porni tura|pornește tura|start/i);
    await expect(page.getByText(/online/i).first()).toBeVisible({ timeout: 30_000 });

    // 1. Going online fires an immediate one-shot fix, so dispatch can see the
    //    courier without waiting for them to move.
    await expect
      .poll(async () => (await trail(userId)).length, {
        timeout: 90_000,
        intervals: [2_000],
      })
      .toBeGreaterThanOrEqual(1);

    const first = (await trail(userId))[0];
    expect(haversineM(first.lat, first.lng, START.latitude, START.longitude)).toBeLessThan(50);

    // The accuracy the browser reported has to survive all the way to the row —
    // it is what the >100m filter judges, and it used to be dropped on the floor.
    expect(first.accuracy_m).not.toBeNull();

    // Presence is written on the same call, and dispatch drops couriers unseen
    // for 5 minutes.
    const { data: shift } = await adminSupabase
      .from('courier_shifts')
      .select('last_lat, last_lng, last_seen_at')
      .eq('courier_user_id', userId)
      .eq('status', 'ONLINE')
      .maybeSingle();
    expect(shift?.last_seen_at).toBeTruthy();

    // 2. A fix 5 m away is the phone drifting on a counter, not a delivery.
    //    It must refresh presence without lengthening the trail.
    //
    //    Asserted as distance rather than row count on purpose: a standstill
    //    long enough to trip the 3-minute trail keepalive legitimately adds a
    //    zero-distance marker carrying the previous coordinates. Counting rows
    //    would call that a regression; what the jitter filter actually promises
    //    is that drift cannot lengthen the route.
    await context.setGeolocation({ ...JITTER, accuracy: 10 });
    await page.waitForTimeout(45_000);
    const afterJitterPoints = await trail(userId);
    const jitterDistance = afterJitterPoints
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum + haversineM(afterJitterPoints[i].lat, afterJitterPoints[i].lng, p.lat, p.lng),
        0,
      );
    expect(jitterDistance).toBeLessThan(1);

    const { data: afterJitter } = await adminSupabase
      .from('courier_shifts')
      .select('last_seen_at')
      .eq('courier_user_id', userId)
      .eq('status', 'ONLINE')
      .maybeSingle();
    expect(new Date(afterJitter!.last_seen_at as string).getTime()).toBeGreaterThan(
      new Date(shift!.last_seen_at as string).getTime(),
    );

    // 3. Real movement is recorded, at the distance actually travelled.
    await context.setGeolocation({ ...MOVED, accuracy: 10 });
    await expect
      .poll(async () => (await trail(userId)).length, {
        timeout: 90_000,
        intervals: [2_000],
      })
      .toBeGreaterThanOrEqual(2);

    const points = await trail(userId);
    const travelled = haversineM(
      points[0].lat,
      points[0].lng,
      points[points.length - 1].lat,
      points[points.length - 1].lng,
    );
    // ~445 m by construction; allow for the emulated fix landing early.
    expect(travelled).toBeGreaterThan(300);
    expect(travelled).toBeLessThan(600);
  });
});
