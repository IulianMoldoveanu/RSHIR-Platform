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
 * ── Why each spec is `test.fixme()` ───────────────────────────────────────
 * Driving /api/checkout/intent end-to-end needs three things the e2e harness
 * does not provide yet:
 *
 *   1. A seeded demo tenant with at least one menu_item (for the cart body).
 *      The multi-city fixtures only seed `cities` rows; the storefront
 *      happy-path spec at e2e/happy-paths/storefront-happy-path.spec.ts has
 *      the same blocker documented inline.
 *
 *   2. A way to flip that tenant's settings.payments.{mode,provider} between
 *      tests without exposing the OWNER-gated server action over HTTP.
 *      Options: a service-role seed helper under e2e/_setup/ OR a Supabase
 *      RPC that lets the test harness mutate tenant settings under a
 *      controlled token. Neither exists today.
 *
 *   3. The PSP_TENANT_TOGGLE_ENABLED env flag set to 'true' for the target
 *      environment, otherwise resolvePaymentSurface() short-circuits to the
 *      legacy CARD-always behavior and the mode field is ignored.
 *
 * Once those land, drop `test.fixme()` and inline the assertions below.
 * Reference shape for each spec is documented in the body comments.
 */

import { test, expect } from '@playwright/test';

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

test.describe('Customer payment sandbox journey', { tag: '@payment-sandbox' }, () => {
  test('Spec 1 — COD: cod_only tenant returns paymentMethod=COD with no PSP url', async ({ request: _request }) => {
    test.fixme(
      true,
      'Requires a seeded demo tenant with menu_items + tenant.settings.payments.mode = ' +
        '"cod_only" + PSP_TENANT_TOGGLE_ENABLED=true. Reference flow once seed helper ' +
        'lands:\n' +
        '  1. POST /api/checkout/quote with the demo cart → capture quote.\n' +
        '  2. POST /api/checkout/intent with paymentMethod=COD + the same cart.\n' +
        '  3. Expect 200 + JSON shape { orderId, publicTrackToken, paymentMethod: "COD", quote }.\n' +
        '  4. Assert `url` is absent (COD skips the PSP entirely — see\n' +
        '     apps/restaurant-web/src/app/api/checkout/intent/route.ts L403).',
    );

    // Reference assertions for the runnable form:
    //
    //   const res = await request.post('/api/checkout/intent', {
    //     data: {
    //       items: [{ itemId: DEMO_ITEM_ID, quantity: 1, modifierIds: [] }],
    //       fulfillment: 'PICKUP',
    //       customer: DEMO_CUSTOMER,
    //       paymentMethod: 'COD',
    //     },
    //   });
    //   expect(res.status()).toBe(200);
    //   const body = await res.json();
    //   expect(body.paymentMethod).toBe('COD');
    //   expect(body.url).toBeUndefined();
    //   expect(body.orderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(DEMO_CUSTOMER.firstName).toBe('Ana'); // anchor to silence unused-import lint
  });

  test('Spec 2 — Netopia sandbox: card_sandbox + provider=netopia returns netopia URL', async ({ request: _request }) => {
    test.fixme(
      true,
      'Requires the demo tenant seed AND tenant.settings.payments = ' +
        '{ mode: "card_sandbox", provider: "netopia" } AND PSP_TENANT_TOGGLE_ENABLED=true. ' +
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
      'Requires the demo tenant seed AND tenant.settings.payments = ' +
        '{ mode: "card_sandbox", provider: "viva" } AND PSP_TENANT_TOGGLE_ENABLED=true. ' +
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
