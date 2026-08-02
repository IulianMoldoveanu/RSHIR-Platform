import { describe, expect, it } from 'vitest';
import { isMarketingSurface } from './seo-marketing';

// The storefront support panel is mounted on every page except the brand
// presentation site. Getting this predicate wrong is invisible in production
// but shows up as a support button on the marketing pages — which is what the
// panel was removed from in the first place — or, worse, as a *missing* one on
// a real storefront. Both directions are covered here.

describe('isMarketingSurface', () => {
  it('treats the production apex as the presentation site', () => {
    expect(isMarketingSurface('hirforyou.ro', false)).toBe(true);
    // A stale selected_tenant cookie can't turn the apex into a storefront —
    // resolveTenantFromHost ignores the override on canonical hosts.
    expect(isMarketingSurface('hirforyou.ro', true)).toBe(true);
  });

  it('treats tenant hosts as storefronts', () => {
    expect(isMarketingSurface('restaurant-demo.hirforyou.ro', false)).toBe(false);
    expect(isMarketingSurface('deliveryhouse.ro', false)).toBe(false);
    // Local tenant convention: the subdomain names the tenant, not an override.
    expect(isMarketingSurface('restaurant-demo.lvh.me', false)).toBe(false);
  });

  it('handles Vercel previews, where the same host serves both surfaces', () => {
    // Bare preview → marketing renders, so no support panel.
    expect(isMarketingSurface('hir-restaurant-web-abc123-scope.vercel.app', false)).toBe(true);
    // ?tenant=<slug> on a preview → a storefront renders, so the panel belongs.
    expect(isMarketingSurface('hir-restaurant-web-abc123-scope.vercel.app', true)).toBe(false);
    expect(isMarketingSurface('hir-restaurant-web.vercel.app', false)).toBe(true);
    expect(isMarketingSurface('hir-restaurant-web.vercel.app', true)).toBe(false);
  });

  it('handles localhost the same way as a preview', () => {
    expect(isMarketingSurface('localhost', false)).toBe(true);
    expect(isMarketingSurface('localhost', true)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isMarketingSurface('HIRforYOU.ro', false)).toBe(true);
    expect(isMarketingSurface('Restaurant-Demo.HIRforYOU.ro', false)).toBe(false);
  });
});
