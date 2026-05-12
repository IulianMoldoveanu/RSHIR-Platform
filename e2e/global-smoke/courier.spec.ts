import { test, expect } from '@playwright/test';

test.describe('Courier PWA', () => {
  test('login page renders the email/password form', async ({ page }) => {
    const res = await page.goto('/login');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/parol|password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /intr[ăa]|conect|continu[ăa]/i }).first()).toBeVisible();
  });

  test('/dashboard redirects unauthenticated users to /login', async ({ page }) => {
    const res = await page.goto('/dashboard');
    expect(res?.status()).toBeLessThan(400);
    const url = page.url();
    if (!url.includes('/login')) {
      await expect(page.getByLabel(/email/i)).toBeVisible();
    } else {
      expect(url).toMatch(/\/login/);
    }
  });

  test('PWA manifest is served with required keys', async ({ request }) => {
    // Next.js' app-router default route is `/manifest.webmanifest`; older
    // builds use `/manifest.json`. Try the modern path first, fall back to
    // the legacy one before declaring the PWA broken.
    const candidates = ['/manifest.webmanifest', '/manifest.json'];
    let lastStatus = 0;
    let body: Record<string, unknown> | null = null;
    for (const path of candidates) {
      const res = await request.get(path);
      lastStatus = res.status();
      if (lastStatus === 200) {
        try {
          body = (await res.json()) as Record<string, unknown>;
          break;
        } catch {
          // wrong content-type — try next candidate
        }
      }
    }
    expect(body, `manifest not served at any of ${candidates.join(', ')} (last status ${lastStatus})`).not.toBeNull();
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('icons');
    expect(Array.isArray((body as { icons?: unknown }).icons)).toBe(true);
  });
});
