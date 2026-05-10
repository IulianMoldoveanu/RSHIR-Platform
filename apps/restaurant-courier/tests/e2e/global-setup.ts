import { chromium, type FullConfig } from '@playwright/test';

// Warm `next dev` route compilation BEFORE the test suite starts.
//
// Without this, the first test (typically 01-login-shift) eats the
// cold-compile latency of `/login` + `/dashboard`. On CI mobile-chrome
// emulation that easily exceeds the 10s expect timeout, producing flake
// failures that mask real bugs.
//
// We hit each route in turn, wait for the page to be interactive, then
// throw away the browser. Total cost ~10-25s but fully amortised over
// the rest of the suite.
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3002';
  const ROUTES = ['/login', '/dashboard', '/dashboard/orders', '/dashboard/settings'];

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      try {
        await page.goto(`${baseURL}${route}`, { waitUntil: 'load', timeout: 60_000 });
      } catch {
        // Best-effort warmup; tests will surface real failures.
      }
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
}
