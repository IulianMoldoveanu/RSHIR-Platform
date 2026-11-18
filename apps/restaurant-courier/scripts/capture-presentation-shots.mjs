// Captures real screenshots of the courier PWA for the /curier presentation
// page on hirforyou.ro.
//
// House rule for that site: real screenshots only — hand-drawn CSS mockups
// read as loading skeletons and were rejected once already. So these come
// from the live app, on a phone viewport, signed in as the Play tester
// account (never a real courier's account: a courier's screens can carry a
// customer's name and address).
//
// Run from apps/restaurant-courier (Playwright resolves only from here):
//   node scripts/capture-presentation-shots.mjs
//
// Output lands in scripts/.shots/ as full-colour PNGs. Review every one for
// customer data BEFORE converting to WebP and committing — that review is
// the point of writing them to a scratch folder instead of public/.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.SHOT_BASE ?? 'https://curier.hirforyou.ro';
const EMAIL = process.env.SHOT_EMAIL;
const PASSWORD = process.env.SHOT_PASSWORD;
const OUT = path.join(import.meta.dirname, '.shots');

if (!EMAIL || !PASSWORD) {
  console.error('Set SHOT_EMAIL and SHOT_PASSWORD (never hardcode them here).');
  process.exit(1);
}

// Pixel 7-ish: a real mid-range Android, which is what a courier actually
// holds. Capturing on a tall iPhone viewport flatters the layout.
const VIEWPORT = { width: 412, height: 915 };

const SHOTS = [
  { name: 'courier-home', path: '/dashboard', settle: 4500 },
  { name: 'courier-shift', path: '/dashboard/shift', settle: 2000 },
  { name: 'courier-orders', path: '/dashboard/orders', settle: 2000 },
  { name: 'courier-earnings', path: '/dashboard/earnings', settle: 2500 },
  { name: 'courier-score', path: '/dashboard/score', settle: 2000 },
  { name: 'courier-settings', path: '/dashboard/settings', settle: 1500 },
  { name: 'courier-help', path: '/dashboard/help', settle: 1500 },
];

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // retina, so the WebP still looks sharp when scaled
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    // The home screen asks for a position to centre the map on. Pin it to
    // central Bucharest so the capture shows the city we are selling into
    // rather than a world view or a permission prompt.
    geolocation: { latitude: 44.4268, longitude: 26.1025 },
    permissions: ['geolocation'],
  });
  // Mark every first-run overlay as already seen BEFORE any page script
  // runs. Clicking them away one at a time does not work: dismissing the
  // welcome carousel just starts the feature tour behind it, and the
  // install prompt and permission rationales arrive on their own timers.
  // These are the keys the app itself writes once a courier has seen them.
  await context.addInitScript(() => {
    const seen = {
      'hir-courier-onboarded': '1',
      'hir-courier-first-shift-done': '1',
      'hir.courier.preShiftChecklistDismissed': '1',
      'hir_loc_rationale_shown_v3': '1',
      'push-prompt-dismissed-v1': '1',
      'hir_curier_pwa_dismissed_until': String(Date.now() + 86_400_000),
      'pushReAskAt': String(Date.now() + 86_400_000),
    };
    try {
      for (const [k, v] of Object.entries(seen)) localStorage.setItem(k, v);
    } catch {
      /* private mode — the overlays will show and the shot gets skipped */
    }
  });

  const page = await context.newPage();

  console.log('signing in…');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /conect|intr|login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  console.log('signed in →', page.url());


  for (const shot of SHOTS) {
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle', timeout: 45_000 });
      // Let the map tiles, the install prompt timer and any entry animation
      // settle, then take the toasts and the install card out of the frame —
      // they are state, not product.
      await page.waitForTimeout(shot.settle);
      await page.evaluate(() => {
        for (const sel of ['[data-sonner-toaster]', '[role="status"]', '[data-pwa-install]']) {
          document.querySelectorAll(sel).forEach((el) => el.remove());
        }
      });
      const file = path.join(OUT, `${shot.name}.png`);
      await page.screenshot({ path: file });
      console.log('  captured', shot.name, '←', shot.path);
    } catch (err) {
      console.log('  SKIPPED', shot.name, '—', err.message.split('\n')[0]);
    }
  }

  await browser.close();
  console.log(`\ndone → ${OUT}\nreview each PNG for customer names/addresses before using any of them.`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
