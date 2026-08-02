import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { resetEmbedOriginCache } from '@/lib/embed-origins';

// Regression cover for the framing headers. This shipped broken once: a
// blanket `X-Frame-Options: SAMEORIGIN` in next.config.mjs meant the embed
// widget's iframe was refused on every merchant domain, silently killing the
// product. It then shipped too permissive: `frame-ancestors *` let any site
// on the internet frame a checkout surface. The rules below are the contract
// that keeps both from recurring.

function req(url: string, cookie?: string) {
  const host = new URL(url).host;
  return new NextRequest(new URL(url), {
    headers: cookie ? { host, cookie } : { host },
  });
}

/** Stand in for the v_tenants_storefront lookup the middleware makes. */
function mockTenant(row: Record<string, unknown> | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(row ? [row] : []), { status: 200 })),
  );
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-test-key');
  resetEmbedOriginCache();
  mockTenant(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('middleware framing headers', () => {
  it('locks framing to same-origin on a normal request', async () => {
    const res = await middleware(req('https://hirforyou.ro/cum-functioneaza'));
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('does NOT open framing to the world in embed mode', async () => {
    const res = await middleware(req('https://restaurant-demo.hirforyou.ro/?embed=1'));
    expect(res.headers.get('content-security-policy')).not.toContain('frame-ancestors *');
  });

  it('denies third-party framing when the tenant registered no origins', async () => {
    mockTenant({ custom_domain: null, domain_status: 'NONE', settings: {} });
    const res = await middleware(req('https://restaurant-demo.hirforyou.ro/?embed=1'));
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    // Same meaning, so the legacy header can stay for old browsers.
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('allows the origins the tenant registered, and drops X-Frame-Options', async () => {
    mockTenant({
      custom_domain: null,
      domain_status: 'NONE',
      settings: { embed: { allowed_origins: ['https://restaurantulmeu.ro'] } },
    });
    const res = await middleware(req('https://restaurant-demo.hirforyou.ro/?embed=1'));
    expect(res.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'self' https://restaurantulmeu.ro",
    );
    // X-Frame-Options has no "allow this specific origin" value, so any value
    // at all would re-break the widget.
    expect(res.headers.get('x-frame-options')).toBeNull();
  });

  it('allows a verified custom domain with no configuration at all', async () => {
    mockTenant({ custom_domain: 'deliveryhouse.ro', domain_status: 'VERIFIED', settings: {} });
    const csp = (await middleware(req('https://deliveryhouse.hirforyou.ro/?embed=1')))
      .headers.get('content-security-policy') ?? '';
    expect(csp).toContain('https://deliveryhouse.ro');
    expect(csp).toContain('https://www.deliveryhouse.ro');
  });

  it('ignores an unverified custom domain', async () => {
    mockTenant({ custom_domain: 'attacker.example', domain_status: 'PENDING', settings: {} });
    const csp = (await middleware(req('https://deliveryhouse.hirforyou.ro/?embed=1')))
      .headers.get('content-security-policy') ?? '';
    expect(csp).not.toContain('attacker.example');
  });

  it('refuses a configured origin that would inject extra CSP directives', async () => {
    mockTenant({
      custom_domain: null,
      domain_status: 'NONE',
      settings: {
        embed: { allowed_origins: ["https://ok.ro; script-src *", 'https://*', 'javascript:alert(1)'] },
      },
    });
    const csp = (await middleware(req('https://restaurant-demo.hirforyou.ro/?embed=1')))
      .headers.get('content-security-policy') ?? '';
    expect(csp).toContain("frame-ancestors 'self';");
    expect(csp).not.toContain('script-src *');
    expect(csp).not.toContain('javascript:');
  });

  it('fails closed when the tenant lookup errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const res = await middleware(req('https://restaurant-demo.hirforyou.ro/?embed=1'));
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('ignores ?tenant= on the canonical host, where it does not pick the tenant either', async () => {
    mockTenant({
      custom_domain: null,
      domain_status: 'NONE',
      settings: { embed: { allowed_origins: ['https://partenerul-lor.ro'] } },
    });
    // Honouring the override here would let a tenant's registered partner
    // frame pages that tenant doesn't own — /account on the apex, say.
    const csp = (await middleware(req('https://hirforyou.ro/account?tenant=restaurant-demo&embed=1')))
      .headers.get('content-security-policy') ?? '';
    expect(csp).not.toContain('partenerul-lor.ro');
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it('still honours ?tenant= on preview hosts, where it does pick the tenant', async () => {
    mockTenant({
      custom_domain: null,
      domain_status: 'NONE',
      settings: { embed: { allowed_origins: ['https://restaurantulmeu.ro'] } },
    });
    const csp = (await middleware(req('https://hir-restaurant-web.vercel.app/?tenant=restaurant-demo&embed=1')))
      .headers.get('content-security-policy') ?? '';
    expect(csp).toContain('https://restaurantulmeu.ro');
  });

  it('ships the nonce-free CSP directives on every response', async () => {
    const csp = (await middleware(req('https://hirforyou.ro/'))).headers.get('content-security-policy') ?? '';
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });
});
