import { type Page } from '@playwright/test';
import { E2E_COURIER_EMAIL, E2E_COURIER_PASSWORD } from '../fixtures/seed';

/**
 * Login through the real `/login` form so the test exercises the same
 * cookie-setting code path the production app does. Returns once the
 * dashboard has rendered the offline UI.
 */
export async function loginAsTestCourier(page: Page): Promise<void> {
  // Skip first-run onboarding overlays so tests can interact with the real
  // dashboard immediately (welcome carousel + first-shift tutorial would
  // otherwise sit on top of /dashboard and block locators).
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('hir-courier-onboarded', '1');
      window.localStorage.setItem('hir-courier-first-shift-done', '1');
    } catch {
      // localStorage may be unavailable in private/iframe contexts — ignore.
    }
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_COURIER_EMAIL);
  await page.getByLabel('Parola').fill(E2E_COURIER_PASSWORD);
  await page.getByRole('button', { name: /intr|conect|continuă/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/dashboard'), { timeout: 30_000 });
}

/**
 * Press-and-hold the swipe-to-confirm slider for 1100ms so the
 * `setTimeout(..., 900)` fallback fires. More reliable in headless than
 * synthesising a drag gesture.
 */
export async function holdSwipeButton(page: Page, labelMatch: RegExp): Promise<void> {
  // SwipeButton renders the label inside a sibling <div>, not the
  // <button> handle itself. The handle carries the label only via
  // aria-label, so match `getByRole('button', { name })` rather than
  // a hasText filter that looks at descendant text (there is none —
  // the button only contains a ChevronRight icon).
  const target = page.getByRole('button', { name: labelMatch }).first();
  await target.waitFor({ state: 'visible', timeout: 30_000 });
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
