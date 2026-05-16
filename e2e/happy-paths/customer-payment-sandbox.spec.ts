/**
 * Customer payment journey — sandbox PSP coverage (Wave 4-A).
 *
 * Exercises the canonical card-payment exit shape on top of PR #514's
 * Stripe-out cutover. We verify the storefront's /api/checkout/intent route
 * picks the right provider sandbox URL for each tenant settings combination:
 *
 *   Spec 1  COD             mode=cod_only            → 200 OK, paymentMethod=COD, no `url`
 *   Spec 2  Netopia sandbox mode=card_sandbox        → `url` startsWith NETOPIA_SANDBOX_PREFIX,
 *                           provider=netopia             paymentMethod=CARD, provider=netopia
 *   Spec 3  Viva sandbox    mode=card_sandbox        → `url` startsWith VIVA_SANDBOX_PREFIX,
 *                           provider=viva                paymentMethod=CARD, provider=viva
 *
 * URL prefixes come from packages/integration-core/src/payment/{netopia,viva}.ts
 * — sandbox bases are deterministic so the assertions stay independent of
 * whatever credentials happen to be wired into the test env. We never POST to
 * the real PSP: this spec stops at the redirect URL returned to the client.
 *
 * ── Wave 4-A status ───────────────────────────────────────────────────────
 * Spec 1 (COD) is ACTIVE — backed by `e2e/_setup/demo-tenant-seed.ts` which
 * lands the canonical `e2e-demo` tenant + menu_items under service-role.
 *
 * Specs 2 & 3 (Netopia / Viva sandbox) remain `test.fixme()` pending a
 * dry-run of the seed against the staging Supabase project — the COD spec
 * is the proof-of-concept; once it passes against staging in CI we promote
 * the card-sandbox specs (which additionally need PSP_TENANT_TOGGLE_ENABLED
 * + NETOPIA_SANDBOX_* / VIVA_SANDBOX_* secrets wired in the target env).
 */

import { test, expect } from '@playwright/test';
import { seedDemoTenant } from '../_setup/demo-tenant-seed';
import { cleanupDemoTenant } from '../_setup/demo-tenant-teardown';

// Sandbox redirect prefixes — kept in lockstep with NETOPIA_BASE.sandbox /
// VIVA_BASE.sandbox in packages/integration-core/src/payment/{netopia,viva}.ts.
// If those constants move, these strings move with them.
const NETOPIA_SANDBOX_PREFIX = 'https://secure.sandbox.netopia-payments.com/payment/card/start';
const VIVA_SANDBOX_PREFIX = 'https://demo.vivapayments.com/web/checkout';

const DEMO_CUSTOMER = {
  firstName: 'Ana',
  lastName: 'Popescu',
  phone: '+40712345678',
  email: 'ana.test@example.ro',
} as const;

// Host header the storefront uses to resolve the demo tenant.
// resolveTenantFromHost() in apps/restaurant-web/src/lib/tenant.ts treats
// `<slug>.lvh.me` as a subdomain match (dev fallback that always resolves
// to 127.0.0.1) and looks the slug up in v_tenants_storefront.
const DEMO_TENANT_HOST = 'e2e-demo.lvh.me';

test.describe('Customer payment sandbox journey', { tag: '@payment-sandbox' }, () => {
  let seededTenantId: string | undefined;

  test.beforeAll(async () => {
    const seeded = await seedDemoTenant({ paymentMode: { mode: 'cod_only' } });
    seededTenantId = seeded.tenantId;
  });

  test.afterAll(async () => {
    if (seededTenantId) {
      await cleanupDemoTenant(seededTenantId);
      seededTenantId = undefined;
    }
  });

  test('Spec 1 — COD: cod_only tenant returns paymentMethod=COD with no PSP url', async ({ request }) => {
    // Re-seed inside the test so we can read the menu item id without
    // hoisting it onto a shared describe-scope variable. seedDemoTenant is
    // idempotent — same tenant + menu items reused from beforeAll.
    const seeded = await seedDemoTenant({ paymentMode: { mode: 'cod_only' } });
    const firstItem = seeded.menuItems[0];
    expect(firstItem, 'demo tenant must have at least one menu item').toBeDefined();

    const res = await request.post('/api/checkout/intent', {
      headers: {
        host: DEMO_TENANT_HOST,
        'x-hir-host': DEMO_TENANT_HOST,
        // Same-origin gate: assertSameOrigin matches origin against self.
        // We synthesize a same-origin header that lines up with the host
        // we're impersonating so the request isn't rejected as
        // forbidden_origin.
        origin: `http://${DEMO_TENANT_HOST}`,
      },
      data: {
        items: [{ itemId: firstItem.id, quantity: 1, modifierIds: [] }],
        fulfillment: 'PICKUP',
        customer: DEMO_CUSTOMER,
        paymentMethod: 'COD',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.paymentMethod).toBe('COD');
    expect(body.url).toBeUndefined();
    expect(body.orderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.publicTrackToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('Spec 2 — Netopia sandbox: card_sandbox + provider=netopia returns netopia URL', async ({ request: _request }) => {
    test.fixme(
      true,
      'Promote once seed validated against staging. Demo tenant seed (Spec 1) ' +
        'provides the menu + payment settings flip, but Netopia card-sandbox ALSO requires ' +
        'PSP_TENANT_TOGGLE_ENABLED=true. ' +
        'Also needs NETOPIA_SANDBOX_SIGNATURE + NETOPIA_SANDBOX_API_KEY in the target ' +
        'env (loadProviderCredentials in provider-router.ts rejects otherwise). ' +
        'We never hit the real Netopia sandbox — the assertion stops at the URL shape ' +
        'returned by /api/checkout/intent. Reference flow:\n' +
        '  1. Configure tenant via service-role seed helper.\n' +
        '  2. POST /api/checkout/intent with paymentMethod=CARD + the demo cart.\n' +
        '  3. Expect { paymentMethod: "CARD", provider: "netopia", url: <netopia sandbox URL>, orderId }.\n' +
        `  4. Assert url.startsWith("${NETOPIA_SANDBOX_PREFIX}") AND url.includes("ref=np_").`,
    );

    // Reference assertions:
    //
    //   const res = await request.post('/api/checkout/intent', { data: { ... paymentMethod: 'CARD' } });
    //   expect(res.status()).toBe(200);
    //   const body = await res.json();
    //   expect(body.paymentMethod).toBe('CARD');
    //   expect(body.provider).toBe('netopia');
    //   expect(body.url).toMatch(new RegExp(`^${NETOPIA_SANDBOX_PREFIX.replace(/[.]/g, '\\.')}`));
    //   expect(body.url).toContain('ref=np_');
    expect(NETOPIA_SANDBOX_PREFIX).toMatch(/secure\.sandbox\.netopia-payments\.com/);
  });

  test('Spec 3 — Viva sandbox: card_sandbox + provider=viva returns viva URL', async ({ request: _request }) => {
    test.fixme(
      true,
      'Promote once seed validated against staging. Demo tenant seed (Spec 1) ' +
        'provides the menu + payment settings flip, but Viva card-sandbox ALSO requires ' +
        'PSP_TENANT_TOGGLE_ENABLED=true. ' +
        'Also needs VIVA_SANDBOX_SIGNATURE + VIVA_SANDBOX_API_KEY in the target env. ' +
        'Reference flow mirrors Spec 2 but with provider=viva; URL assertion uses ' +
        `VIVA_SANDBOX_PREFIX="${VIVA_SANDBOX_PREFIX}" and session ids carry the "vv_" prefix.`,
    );

    // Reference assertions:
    //
    //   expect(body.provider).toBe('viva');
    //   expect(body.url).toMatch(new RegExp(`^${VIVA_SANDBOX_PREFIX.replace(/[.]/g, '\\.')}`));
    //   expect(body.url).toContain('ref=vv_');
    expect(VIVA_SANDBOX_PREFIX).toMatch(/demo\.vivapayments\.com/);
  });
});
