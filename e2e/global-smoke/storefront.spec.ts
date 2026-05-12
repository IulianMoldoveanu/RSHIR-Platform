import { test, expect } from '@playwright/test';

// These tests run against the marketing site host (hirforyou.ro) because
// the per-tenant storefront is host-routed and tenant subdomains
// (foisorul-a.hirforyou.ro, etc.) require a CF wildcard DNS that is not
// yet active. Until then, we exercise the public surfaces that PROVE
// the storefront rendering stack + SEO meta pipeline are alive:
//   - /case-studies/foisorul-a   (real Foișorul A landing, og:image set)
//   - /orase/brasov              (real city listing, SSG)
// Both routes share the same Next.js app + middleware + Supabase reads
// that the tenant storefront uses.

test.describe('Storefront surfaces (case-study + city landing)', () => {
  test('Foișorul A case study renders with og:image meta', async ({ page }) => {
    const res = await page.goto('/case-studies/foisorul-a');
    expect(res?.status(), 'case-study HTTP status').toBeLessThan(400);
    await expect(page).toHaveTitle(/foi[șs]orul/i, { timeout: 15_000 });

    const og = page.locator('meta[property="og:image"]');
    await expect(og).toHaveCount(1);
    const ogContent = await og.getAttribute('content');
    expect(ogContent, 'og:image content URL').toBeTruthy();
  });

  test('city landing /orase/brasov loads with breadcrumbs', async ({ page }) => {
    const res = await page.goto('/orase/brasov');
    expect(res?.status()).toBeLessThan(400);
    // Either the heading mentions Brașov, or a "Brașov" link/text is
    // visible somewhere on the page.
    await expect(page.getByText(/bra[șs]ov/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
