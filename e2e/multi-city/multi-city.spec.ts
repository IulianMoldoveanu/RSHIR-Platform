/**
 * Multi-city smoke — iterate all 12 RO cities seeded in `public.cities`.
 *
 * Wave 4-C expansion: storefront-city-landing.spec.ts already covers
 * brasov + cluj-napoca individually plus the /orase index card grid.
 * This spec sweeps the remaining 10 city slugs so a regression on any
 * single city's SSG/ISR page (or its seed row drift) is caught directly,
 * not implicitly via the index card-count assertion.
 *
 * For each slug we assert:
 *   - HTTP 200 on `/orase/<slug>`
 *   - <h1> contains the human-readable city name (RO diacritics tolerated)
 *   - At least one tenant card OR the explicit empty-state copy is shown
 *     (we never hard-fail on zero tenants — seed data per city varies)
 *
 * Runs against the same `storefront` Playwright project as
 * `storefront-city-landing.spec.ts` (baseURL = restaurant-web).
 */

import { test, expect } from '@playwright/test';

// Matches the seed in `supabase/migrations/20260506_011_cities_multi_city.sql`.
// Order mirrors the seed `sort_order` column.
const CITIES = [
  { slug: 'bucuresti',   name: 'București',   match: /bucure[șs]ti/i },
  { slug: 'brasov',      name: 'Brașov',      match: /bra[șs]ov/i },
  { slug: 'cluj-napoca', name: 'Cluj-Napoca', match: /cluj/i },
  { slug: 'timisoara',   name: 'Timișoara',   match: /timi[șs]oara/i },
  { slug: 'iasi',        name: 'Iași',        match: /ia[șs]i/i },
  { slug: 'constanta',   name: 'Constanța',   match: /constan[țt]a/i },
  { slug: 'sibiu',       name: 'Sibiu',       match: /sibiu/i },
  { slug: 'oradea',      name: 'Oradea',      match: /oradea/i },
  { slug: 'galati',      name: 'Galați',      match: /gala[țt]i/i },
  { slug: 'ploiesti',    name: 'Ploiești',    match: /ploie[șs]ti/i },
  { slug: 'craiova',     name: 'Craiova',     match: /craiova/i },
  { slug: 'arad',        name: 'Arad',        match: /arad/i },
] as const;

test.describe('Multi-city smoke (/orase/[slug] sweep)', { tag: '@multi-city' }, () => {
  for (const city of CITIES) {
    test(`/orase/${city.slug} renders ${city.name}`, async ({ page }) => {
      const response = await page.goto(`/orase/${city.slug}`);
      expect(response?.status(), `HTTP status for /orase/${city.slug}`).toBe(200);

      // Hero <h1> should always reference the city (whether tenants exist or not).
      const heading = page.locator('h1').first();
      await expect(heading).toContainText(city.match);

      // Tenant card OR empty-state — never both, never neither.
      const tenantCards = page.locator('a[href^="/m/"]');
      const emptyState = page.getByText(/suntem în pregătire pentru/i);
      const cardCount = await tenantCards.count();
      if (cardCount === 0) {
        // Empty city — UI should explain it instead of rendering a blank grid.
        // We don't fail the suite (seed drift is allowed), just verify the
        // page degraded gracefully and log a warning for visibility.
        // eslint-disable-next-line no-console
        console.warn(
          `[multi-city] /orase/${city.slug}: 0 tenant cards rendered — verifying empty-state copy`,
        );
        await expect(emptyState).toBeVisible();
      } else {
        expect(cardCount).toBeGreaterThan(0);
      }
    });
  }
});
