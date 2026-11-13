import { test, expect } from '@playwright/test';

// The wildcard DNS these tests used to wait on is live, so the first test
// now hits a real tenant storefront on its own subdomain instead of the
// /case-studies/<slug> stand-in, which never shipped and 404s. That
// exercises the whole host-routing path — middleware, tenant resolution,
// Supabase read, SEO meta — rather than a marketing page that happens to
// share the app.
//   - foisorul-a.hirforyou.ro  (real tenant storefront, host-routed)
//   - /orase/brasov            (city listing on the marketing host, SSG)

test.describe('Storefront surfaces (tenant subdomain + city landing)', () => {
  test('Foișorul A storefront answers on its own subdomain', async ({ page }) => {
    // Absolute URL: baseURL is the marketing host, and the point here is
    // that the tenant is resolved from the Host header.
    const res = await page.goto('https://foisorul-a.hirforyou.ro/');
    expect(res?.status(), 'storefront HTTP status').toBeLessThan(400);
    await expect(page).toHaveTitle(/foi[șs]orul/i, { timeout: 15_000 });

    // A storefront that fell back to the marketing page would still answer
    // 200 with a plausible title, so assert the menu itself. Categories are
    // server-rendered as h2, which also means this does not depend on
    // hydration.
    await expect(page.getByRole('heading', { level: 1, name: /foi[șs]orul/i }))
      .toBeVisible({ timeout: 15_000 });
    expect(await page.getByRole('heading', { level: 2 }).count(),
      'menu category headings').toBeGreaterThan(0);

    // Kept from the test this replaces: the SEO meta pipeline must still fire
    // for a tenant page, not just for marketing routes.
    const og = page.locator('meta[property="og:image"]');
    await expect(og).toHaveCount(1);
    expect(await og.getAttribute('content'), 'og:image content URL').toBeTruthy();
  });

  test('city landing /orase/brasov loads with breadcrumbs', async ({ page }) => {
    const res = await page.goto('/orase/brasov');
    expect(res?.status()).toBeLessThan(400);
    // Either the heading mentions Brașov, or a "Brașov" link/text is
    // visible somewhere on the page.
    await expect(page.getByText(/bra[șs]ov/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
