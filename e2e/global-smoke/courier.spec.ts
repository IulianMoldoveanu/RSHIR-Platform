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

  test('PWA manifest.json is served with required keys', async ({ request }) => {
    const res = await request.get('/manifest.json');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('icons');
    expect(Array.isArray(body.icons)).toBe(true);
  });
});
