import { test, expect } from '@playwright/test';

test.describe('Admin dashboard (tenant ops)', () => {
  test('login page renders the email/password form', async ({ page }) => {
    const res = await page.goto('/login');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/parol|password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /intr[ăa]|conect|sign\s*in|continu[ăa]/i }).first()).toBeVisible();
  });

  test('/dashboard redirects unauthenticated users to /login', async ({ page }) => {
    const res = await page.goto('/dashboard');
    expect(res?.status()).toBeLessThan(400);
    // Either redirected to /login or rendered a login form on the same URL.
    const url = page.url();
    if (!url.includes('/login')) {
      await expect(page.getByLabel(/email/i)).toBeVisible();
    } else {
      expect(url).toMatch(/\/login/);
    }
  });

  test('/api/version returns JSON with a commit sha', async ({ request }) => {
    const res = await request.get('/api/version');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('sha');
    expect(typeof body.sha).toBe('string');
    expect(body.sha.length).toBeGreaterThan(0);
  });
});
