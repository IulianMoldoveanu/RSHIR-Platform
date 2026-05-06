/**
 * Test 1 — Storefront city landing pages (no auth required).
 *
 * Covers:
 *   - /orase          → 200, grid of 12 city cards, JSON-LD BreadcrumbList
 *   - /orase/brasov   → 200, hero contains city name, at least one card OR empty-state
 *   - /orase/cluj-napoca → 200
 *   - /orase/no-such-city-xyz → 404 (Next.js notFound() page)
 *   - hreflang alternate links present on city page
 *   - JSON-LD `LocalBusiness` present when tenants are listed
 *
 * baseURL = restaurant-web (port 3000 or E2E_WEB_BASE_URL).
 */

import { test, expect } from '@playwright/test';

const ALL_CITY_SLUGS = [
  'bucuresti',
  'brasov',
  'cluj-napoca',
  'timisoara',
  'iasi',
  'constanta',
  'sibiu',
  'oradea',
  'galati',
  'ploiesti',
  'craiova',
  'arad',
] as const;

test.describe('Storefront city landing pages', { tag: '@multi-city' }, () => {
  test('/orase index renders 12 city cards', async ({ page }) => {
    const response = await page.goto('/orase');
    expect(response?.status()).toBe(200);

    // Each city card is a list item inside the city grid.
    const cards = page.locator('ul li');
    await expect(cards).toHaveCount(ALL_CITY_SLUGS.length);
  });

  test('/orase index contains JSON-LD BreadcrumbList', async ({ page }) => {
    await page.goto('/orase');
    const ldJson = page.locator('script[type="application/ld+json"]').first();
    await expect(ldJson).toBeAttached();
    const raw = await ldJson.textContent();
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed['@type']).toBe('BreadcrumbList');
  });

  test('/orase/brasov returns 200 and renders city name in hero', async ({ page }) => {
    const response = await page.goto('/orase/brasov');
    expect(response?.status()).toBe(200);

    // The page renders either a tenant grid or the empty-state.
    // Both states show the city name in the hero heading.
    const heading = page.locator('h1').first();
    await expect(heading).toContainText('Bra', { ignoreCase: true });
  });

  test('/orase/brasov has at least one tenant card OR empty-state copy', async ({ page }) => {
    await page.goto('/orase/brasov');
    // Tenant cards link to /m/<slug>; empty state shows a signup CTA button.
    const tenantCards = page.locator('a[href^="/m/"]');
    const emptyTitle = page.getByText(/suntem în pregătire pentru/i);
    const count = await tenantCards.count();
    if (count === 0) {
      await expect(emptyTitle).toBeVisible();
    } else {
      expect(count).toBeGreaterThan(0);
    }
  });

  test('/orase/cluj-napoca returns 200', async ({ page }) => {
    const response = await page.goto('/orase/cluj-napoca');
    expect(response?.status()).toBe(200);
  });

  test('/orase/no-such-city-xyz returns 404', async ({ page }) => {
    const response = await page.goto('/orase/no-such-city-xyz');
    // Next.js notFound() triggers the 404 page. The HTTP status is 404.
    expect(response?.status()).toBe(404);
  });

  test('/orase/brasov has hreflang alternate links', async ({ page }) => {
    await page.goto('/orase/brasov');
    // Next.js renders alternates as <link rel="alternate" hreflang="...">
    const hreflangs = page.locator('link[rel="alternate"][hreflang]');
    const count = await hreflangs.count();
    // Expect at least ro-RO + en + x-default = 3
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('/orase/brasov has LocalBusiness JSON-LD when tenants exist', async ({ page }) => {
    await page.goto('/orase/brasov');
    const tenantCards = page.locator('a[href^="/m/"]');
    const count = await tenantCards.count();
    if (count === 0) {
      // Empty city — no LocalBusiness scripts; test is vacuously satisfied.
      return;
    }
    // When tenants render, each card emits a LocalBusiness JSON-LD block.
    const ldScripts = page.locator('script[type="application/ld+json"]');
    const scriptCount = await ldScripts.count();
    expect(scriptCount).toBeGreaterThanOrEqual(2); // breadcrumb + at least 1 LocalBusiness

    let foundLocalBusiness = false;
    for (let i = 0; i < scriptCount; i++) {
      const raw = await ldScripts.nth(i).textContent();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed['@type'] === 'LocalBusiness') {
          foundLocalBusiness = true;
          expect(parsed.address?.addressLocality).toBeTruthy();
          break;
        }
      } catch {
        // skip malformed
      }
    }
    expect(foundLocalBusiness).toBe(true);
  });

  test('/orase index links each card to /orase/<slug>', async ({ page }) => {
    await page.goto('/orase');
    // Verify each city slug has a corresponding link.
    for (const slug of ALL_CITY_SLUGS) {
      const link = page.locator(`a[href="/orase/${slug}"]`);
      await expect(link).toBeVisible();
    }
  });
});
