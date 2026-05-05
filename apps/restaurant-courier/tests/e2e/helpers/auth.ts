import { type Page } from '@playwright/test';
import { E2E_COURIER_EMAIL, E2E_COURIER_PASSWORD } from '../fixtures/seed';

/**
 * Login through the real `/login` form so the test exercises the same
 * cookie-setting code path the production app does. Returns once the
 * dashboard has rendered the offline UI.
 */
export async function loginAsTestCourier(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_COURIER_EMAIL);
  await page.getByLabel('Parola').fill(E2E_COURIER_PASSWORD);
  await page.getByRole('button', { name: /intr|conect|continuă/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/dashboard'));
}

/**
 * Press-and-hold the swipe-to-confirm slider for 1100ms so the
 * `setTimeout(..., 900)` fallback fires. More reliable in headless than
 * synthesising a drag gesture.
 */
export async function holdSwipeButton(page: Page, labelMatch: RegExp): Promise<void> {
  // The button living inside the SwipeButton track has no accessible name;
  // grab it by aria-label or by being inside the visible track text.
  const track = page.locator('[role="button"], button').filter({ hasText: labelMatch }).first();
  const handle = track.locator('button').first();
  const target = (await handle.count()) > 0 ? handle : track;
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Swipe handle not measurable');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
}
