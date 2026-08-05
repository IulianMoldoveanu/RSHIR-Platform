import { test, expect } from '@playwright/test';
import { seedCourier, endAnyOpenShift, adminSupabase } from './fixtures/seed';
import { loginAsTestCourier, holdSwipeButton } from './helpers/auth';

// Diagnostic, not an assertion suite: observe how often a real browser session
// actually reports position while a courier stands still versus moves, and what
// reaches the database each time.
//
// This matters beyond the distance trail. fn_auto_dispatch_sweep refuses any
// courier whose courier_shifts.last_seen_at is older than 5 minutes, so if the
// watcher only emits on movement, a courier waiting at a restaurant silently
// stops being dispatchable.

test.describe('GPS reporting cadence (diagnostic)', () => {
  let userId: string;

  test.beforeEach(async () => {
    const seeded = await seedCourier();
    userId = seeded.userId;
    await endAnyOpenShift(userId);
    await adminSupabase.from('courier_location_pings').delete().eq('courier_user_id', userId);
  });

  test.afterEach(async () => {
    await endAnyOpenShift(userId);
  });

  test('observe cadence while stationary and while moving', async ({ page, context }) => {
    test.setTimeout(480_000);

    const logs: string[] = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

    await context.setGeolocation({ latitude: 45.6427, longitude: 25.5887, accuracy: 10 });
    await loginAsTestCourier(page);
    await holdSwipeButton(page, /glisează|porni tura|pornește tura|start/i);
    await expect(page.getByText(/online/i).first()).toBeVisible({ timeout: 30_000 });

    const snap = async (label: string) => {
      const { data: s } = await adminSupabase
        .from('courier_shifts')
        .select('last_lat, last_lng, last_seen_at')
        .eq('courier_user_id', userId)
        .eq('status', 'ONLINE')
        .maybeSingle();
      const { data: p } = await adminSupabase
        .from('courier_location_pings')
        .select('id')
        .eq('courier_user_id', userId);
      console.log(
        `SNAP ${label}: last_seen_at=${s?.last_seen_at ?? 'null'} lat=${s?.last_lat ?? '-'} pings=${p?.length ?? 0}`,
      );
    };

    await page.waitForTimeout(8_000);
    await snap('t+8s  (after go-online one-shot)');

    // Stand perfectly still for longer than one full heartbeat period.
    // HEARTBEAT_MS is 120s and the keepalive checks every 15s, so the latest a
    // stationary re-report can land is ~135s after the previous send. Waiting
    // only 70s here previously "passed" on a stray watcher event rather than on
    // the heartbeat, which is worse than failing.
    await page.waitForTimeout(150_000);
    await snap('t+158s STATIONARY, position never changed');

    // Nudge 5 m — below the server trail threshold, but a real position event.
    await context.setGeolocation({ latitude: 45.642745, longitude: 25.5887, accuracy: 10 });
    await page.waitForTimeout(40_000);
    await snap('after 5m nudge');

    // Move 450 m — unambiguous movement.
    await context.setGeolocation({ latitude: 45.6467, longitude: 25.5887, accuracy: 10 });
    await page.waitForTimeout(40_000);
    await snap('after 450m move');

    const geoLogs = logs.filter((l) => /location|geo|denied|watch/i.test(l));
    console.log('PAGE LOGS (geo-related):', geoLogs.length ? geoLogs.join('\n') : '(none)');
  });
});
