import { test, expect } from '@playwright/test';

test.describe('Marketing site (hirforyou.ro)', () => {
  test('homepage renders RO copy + primary CTA', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status(), 'homepage HTTP status').toBeLessThan(400);
    // Brand strip — the visible HIR brand must appear somewhere above the fold.
    await expect(page.getByRole('heading').first()).toBeVisible();
    // The pricing CTA this used to assert was removed with /pricing itself
    // (2026-08-01: the site stopped quoting a price). The primary conversion
    // anchors are now the demo and the how-it-works guide.
    await expect(
      page.getByRole('link', { name: /vezi demo|cum func[țt]ioneaz[ăa]/i }).first(),
    ).toBeVisible();
  });

  // /pricing was deleted on 2026-08-01 and 301s to the homepage: the site
  // deliberately quotes no price any more. What is worth protecting is the
  // redirect — a stray 404 here would break old inbound links — so this
  // asserts the decision instead of the page it replaced.
  test('/pricing still redirects to the homepage', async ({ page }) => {
    const res = await page.goto('/pricing');
    expect(res?.status()).toBeLessThan(400);
    expect(new URL(page.url()).pathname).toBe('/');
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
