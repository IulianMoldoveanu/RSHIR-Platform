import { test, expect } from '@playwright/test';

test.describe('Marketing site (hirforyou.ro)', () => {
  test('homepage renders RO copy + primary CTA', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status(), 'homepage HTTP status').toBeLessThan(400);
    // Brand strip — the visible HIR brand must appear somewhere above the fold.
    await expect(page.getByRole('heading').first()).toBeVisible();
    // Pricing CTA is the primary conversion anchor on the homepage.
    // Live copy uses "Tarife"; accept the historic "Prețuri" + EN fallback.
    await expect(
      page.getByRole('link', { name: /tarif|pre[țt]uri|pricing/i }).first(),
    ).toBeVisible();
  });

  test('/pricing loads and shows the 2 lei/comandă tier', async ({ page }) => {
    const res = await page.goto('/pricing');
    expect(res?.status()).toBeLessThan(400);
    // The single-tier price is the locked pricing decision; if this text
    // ever disappears something is structurally broken on the pricing page.
    await expect(page.getByText(/2\s*lei.*comand[ăa]|comand[ăa].*2\s*lei/i).first()).toBeVisible();
  });

  test('/alternativa-gloriafood-romania landing renders', async ({ page }) => {
    const res = await page.goto('/alternativa-gloriafood-romania');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByText(/gloriafood/i).first()).toBeVisible();
  });

  test('sitemap.xml is served', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('<urlset');
  });

  test('robots.txt is served', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.toLowerCase()).toContain('user-agent');
  });
});
