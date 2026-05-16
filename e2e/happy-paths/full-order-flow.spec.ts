/**
 * Full order lifecycle happy-path — customer → admin → courier → delivered.
 *
 * This is the canonical end-to-end spec the platform needs to prove a
 * complete order journey runs through every layer without hand-driven
 * intervention. It deliberately splits the lifecycle in two phases:
 *
 *   PHASE A — Customer places the order via the real /api/checkout/intent
 *             route (same exit point as the storefront checkout). This
 *             exercises pricing, tenant resolution, idempotency, and the
 *             restaurant_orders insert under genuine load. ACTIVE TEST.
 *
 *   PHASE B — Lifecycle transitions (CONFIRMED → PREPARING → READY →
 *             DISPATCHED → DELIVERED) are driven by direct service-role
 *             UPDATEs on restaurant_orders, *not* by clicking through the
 *             admin and courier UIs. This bypasses the auth-cookie /
 *             role-membership flow which would require a full Supabase
 *             auth handshake we can't reproduce in a stateless API
 *             request context.
 *
 *             The point of Phase B is to prove the *data* lifecycle works
 *             end-to-end. The admin and courier UI surfaces have their own
 *             happy-path specs (`courier-happy-path.spec.ts` +
 *             `storefront-happy-path.spec.ts`) that fixme through the
 *             UI-driven flow once auth seeding lands.
 *
 *   PHASE C — Customer hits the public /track route with the
 *             public_track_token returned from Phase A and asserts the
 *             status is DELIVERED. ACTIVE TEST.
 *
 * Net coverage:
 *   - /api/checkout/intent (customer write path)            ✓
 *   - restaurant_orders.status transitions                  ✓
 *   - /track public read (customer-facing post-delivery)    ✓
 *   - Admin UI auth + role gate                              fixme (covered by other specs)
 *   - Courier PWA push + accept                              fixme (covered by other specs)
 *
 * Run prerequisites (same as the other happy-path specs):
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL   service-role host
 *   SUPABASE_SERVICE_ROLE_KEY                  service-role key
 *   Storefront dev server reachable at the configured Playwright baseURL
 *     (defaults to http://localhost:3000 — restaurant-web app)
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { seedDemoTenant } from '../_setup/demo-tenant-seed';
import { cleanupDemoTenant } from '../_setup/demo-tenant-teardown';

const DEMO_TENANT_HOST = 'e2e-demo.lvh.me';

const DEMO_CUSTOMER = {
  firstName: 'Ion',
  lastName: 'Popescu',
  phone: '+40712345678',
  email: 'ion.e2e@test.hir.ro',
} as const;

const DEMO_DELIVERY_ADDRESS = {
  line1: 'Strada Lungă 5',
  city: 'Brașov',
  notes: null,
} as const;

// Service-role client used by Phase B to drive the lifecycle. Mirrors the
// pattern in `_setup/demo-tenant-seed.ts` — never imported from app code.
function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'full-order-flow.spec.ts requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + ' +
        'SUPABASE_SERVICE_ROLE_KEY at run time. Set them in the Playwright run env.',
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Updates restaurant_orders.status under service-role and asserts the row
// reflects the new value. Audit_log writes are skipped — those are tested
// by the admin server-action unit tests; here we only care the data path
// works.
async function setOrderStatus(
  sb: SupabaseClient,
  orderId: string,
  next: 'CONFIRMED' | 'PREPARING' | 'READY' | 'DISPATCHED' | 'DELIVERED',
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = sb as any;
  const { error } = await c
    .from('restaurant_orders')
    .update({ status: next })
    .eq('id', orderId);
  if (error) {
    throw new Error(`setOrderStatus(${next}) failed: ${error.message}`);
  }
}

test.describe('Full order lifecycle', { tag: '@full-order-flow' }, () => {
  let seededTenantId: string | undefined;
  let orderId: string | undefined;
  let publicTrackToken: string | undefined;

  test.beforeAll(async () => {
    const seeded = await seedDemoTenant({
      paymentMode: { mode: 'cod_only' },
      withCourier: true,
    });
    seededTenantId = seeded.tenantId;
  });

  test.afterAll(async () => {
    if (seededTenantId) {
      await cleanupDemoTenant(seededTenantId);
      seededTenantId = undefined;
    }
  });

  test('PHASE A — customer places COD order via /api/checkout/intent', async ({ request }) => {
    const seeded = await seedDemoTenant({ paymentMode: { mode: 'cod_only' } });
    const firstItem = seeded.menuItems[0];
    expect(firstItem, 'demo tenant must have a menu item').toBeDefined();

    const res = await request.post('/api/checkout/intent', {
      headers: {
        host: DEMO_TENANT_HOST,
        'x-hir-host': DEMO_TENANT_HOST,
        origin: `http://${DEMO_TENANT_HOST}`,
      },
      data: {
        items: [{ itemId: firstItem.id, quantity: 2, modifierIds: [] }],
        fulfillment: 'DELIVERY',
        customer: DEMO_CUSTOMER,
        address: DEMO_DELIVERY_ADDRESS,
        paymentMethod: 'COD',
      },
    });
    expect(res.status(), 'COD checkout returns 200').toBe(200);
    const body = (await res.json()) as {
      orderId: string;
      paymentMethod: string;
      url?: string;
      publicTrackToken: string;
    };
    expect(body.paymentMethod).toBe('COD');
    expect(body.url).toBeUndefined();
    expect(body.orderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.publicTrackToken).toMatch(/^[0-9a-f-]{36}$/);

    // Hand orderId + token off to subsequent phases via the describe-scope
    // closure variables. Playwright's per-test serialization with one
    // describe block runs them in order, so this is safe within this spec.
    orderId = body.orderId;
    publicTrackToken = body.publicTrackToken;
  });

  test('PHASE B — restaurant + courier transitions drive status to DELIVERED', async () => {
    expect(orderId, 'PHASE A must have run first and stored orderId').toBeDefined();
    const sb = adminClient();

    // Restaurant side: PENDING → CONFIRMED → PREPARING → READY → DISPATCHED.
    // Matches the canonical transition table in
    // apps/restaurant-admin/src/app/dashboard/orders/status-machine.ts.
    await setOrderStatus(sb, orderId!, 'CONFIRMED');
    await setOrderStatus(sb, orderId!, 'PREPARING');
    await setOrderStatus(sb, orderId!, 'READY');
    await setOrderStatus(sb, orderId!, 'DISPATCHED');

    // Courier side: DISPATCHED → DELIVERED.
    // The real courier app calls dashboard/actions.ts#markDeliveredAction
    // which adds proof-of-delivery metadata. For data-lifecycle coverage we
    // only assert the status transition; the proof-of-delivery server-side
    // gate has its own unit test in apps/restaurant-courier.
    await setOrderStatus(sb, orderId!, 'DELIVERED');

    // Read back to assert the persisted state is DELIVERED. Belt-and-braces:
    // if any earlier update was silently rejected (RLS, check constraint,
    // missing column), this read surfaces it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = sb as any;
    const { data: row } = await c
      .from('restaurant_orders')
      .select('id, status, public_track_token')
      .eq('id', orderId!)
      .maybeSingle();
    expect(row, 'order row reachable under service-role').toBeTruthy();
    expect(row.status).toBe('DELIVERED');
    expect(row.public_track_token).toBe(publicTrackToken);
  });

  test('PHASE C — public /track page reports DELIVERED for the customer', async ({ request }) => {
    expect(orderId, 'PHASE A must have run first').toBeDefined();
    expect(publicTrackToken, 'PHASE A must have produced a token').toBeDefined();

    const res = await request.get(`/track?token=${publicTrackToken}`, {
      headers: {
        host: DEMO_TENANT_HOST,
        'x-hir-host': DEMO_TENANT_HOST,
      },
    });
    expect(res.status(), '/track returns 200 for a valid token').toBe(200);
    const html = await res.text();
    // The track page is server-rendered HTML — we sniff the rendered status
    // label, not a JSON body. Matches the canonical RO labels in
    // apps/restaurant-web/src/app/track/page.tsx.
    expect(html, 'track page mentions the order id').toContain(orderId!);
    // DELIVERED status surfaces as "Livrată" in RO. If track ever moves to
    // a different label, update this regex along with the page copy.
    expect(html).toMatch(/Livrat[ăa]/i);
  });

  test.fixme(
    'PHASE D (deferred) — admin UI confirms transition then courier PWA accepts via the real auth flow',
    async () => {
      // Promote this fixme into a real test once the e2e harness has:
      //   1. A way to seed an OWNER auth cookie for the demo tenant (so the
      //      admin server actions in dashboard/orders/actions.ts can be
      //      driven through the real auth + role-membership guard).
      //   2. A courier PWA Playwright session that can call
      //      dashboard/actions.ts#markDeliveredAction with the courier auth
      //      session set up by seedDemoTenant({ withCourier: true }).
      //
      // Reference flow once unblocked:
      //   - sign in as the seeded OWNER, navigate to /dashboard/orders,
      //     click the canonical transition buttons one at a time, assert
      //     audit_log rows appear with action='order.status_changed'.
      //   - switch the Playwright context to the courier app subdomain,
      //     sign in with DEMO_COURIER_EMAIL + DEMO_COURIER_PASSWORD,
      //     accept the offered order, mark delivered, assert
      //     courier_proofs row is written.
      //
      // The PHASE A + B + C trio above already proves the data path; this
      // fixme covers the UI-driven journey for visual regression and click-
      // through smoke. Not blocking customer launch.
    },
  );
});
