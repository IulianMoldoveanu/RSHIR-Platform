// Lane G — End-to-end smoke for the Stripe checkout flow.
//
// What it does:
//   1. POST /api/checkout/intent with a real-looking cart for FOISORUL A
//   2. Capture clientSecret + orderId from the response
//   3. Confirm the PaymentIntent server-side with the test card 4242 4242…
//   4. Poll restaurant_orders for payment_status='PAID' (set by the webhook)
//   5. Print ✓ on success, ✗ on any step failure
//
// Requires (in vault):
//   stripe.test.secret_key       — sk_test_...
//   stripe.test.publishable_key  — pk_test_... (sanity)
//   supabase.url + service_role_key (read-only check)
//
// Requires Vercel env on hir-restaurant-web set to the same TEST keys, plus
// STRIPE_WEBHOOK_SECRET wired to a Stripe CLI listener or the dashboard
// endpoint pointing at https://<your-deploy>/api/webhooks/stripe.
//
//   node "C:/Users/Office HIR CEO/Desktop/AI Projects/RSHIR-claude-wt-laneG/scripts/smoke-stripe-checkout.mjs"
//
// Optional:
//   STOREFRONT_URL=https://www.foisorulalb.ro node ...

import { readFileSync } from 'node:fs';

const VAULT_PATH = 'C:/Users/Office HIR CEO/.hir/secrets.json';
const v = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));

const STRIPE_SECRET = v.stripe?.test?.secret_key;
const SUPABASE_URL = v.supabase.url;
const SERVICE_ROLE = v.supabase.service_role_key;
const STOREFRONT = process.env.STOREFRONT_URL || 'https://www.foisorulalb.ro';

if (!STRIPE_SECRET) {
  console.error('✗ stripe.test.secret_key missing from vault');
  console.error('  Add it to C:/Users/Office HIR CEO/.hir/secrets.json under stripe.test.secret_key');
  console.error('  before running this smoke.');
  process.exit(2);
}

console.log('=== Stripe checkout smoke ===');
console.log('storefront:', STOREFRONT);

// Step 1: create a checkout intent.
const cart = {
  items: [{ menuItemId: 'SMOKE_MENU_ITEM', quantity: 1, modifiers: [] }],
  customer: {
    firstName: 'Smoke',
    lastName: 'Test',
    phone: '+40700000000',
    email: 'smoke-test@hir.local',
  },
  fulfillment: 'PICKUP',
  paymentMethod: 'CARD',
};

console.log('\n[1/4] POST /api/checkout/intent ...');
const intentResp = await fetch(`${STOREFRONT}/api/checkout/intent`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: STOREFRONT,
    Referer: STOREFRONT,
  },
  body: JSON.stringify(cart),
});

if (!intentResp.ok) {
  console.error('✗ intent failed:', intentResp.status, await intentResp.text());
  console.error('  (a 422 quote_failed means SMOKE_MENU_ITEM doesn\'t exist — set a real menu_item id)');
  process.exit(1);
}

const intentJson = await intentResp.json();
console.log('  → orderId:', intentJson.orderId);
console.log('  → clientSecret:', intentJson.clientSecret?.slice(0, 24) + '...');

if (!intentJson.clientSecret || !intentJson.orderId) {
  console.error('✗ response missing clientSecret/orderId');
  process.exit(1);
}

// Step 2: confirm with test card via Stripe API. The Payment-Intent
// confirmation flow normally happens client-side via Stripe.js Elements;
// for a CI/smoke harness we use the legacy "tok_visa" payment_method (Stripe
// keeps it for testing) which corresponds to 4242 4242 4242 4242.
const intentId = intentJson.clientSecret.split('_secret_')[0];
console.log('\n[2/4] Confirming PaymentIntent', intentId, 'with tok_visa ...');

const confirmResp = await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}/confirm`, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + STRIPE_SECRET,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ payment_method: 'pm_card_visa' }).toString(),
});

if (!confirmResp.ok) {
  console.error('✗ confirm failed:', confirmResp.status, await confirmResp.text());
  process.exit(1);
}
const confirmJson = await confirmResp.json();
console.log('  → status:', confirmJson.status);
if (confirmJson.status !== 'succeeded') {
  console.error('✗ expected succeeded, got', confirmJson.status);
  process.exit(1);
}

// Step 3: poll the order for payment_status='PAID'. Webhook delivery from
// Stripe → Vercel typically lands within 1-3 seconds. Allow up to 30s.
console.log('\n[3/4] Polling order for payment_status=PAID (≤30s)...');
const orderId = intentJson.orderId;
let paid = false;
let lastStatus = null;
const start = Date.now();
while (Date.now() - start < 30_000) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/restaurant_orders?id=eq.${orderId}&select=payment_status,status`,
    { headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE } },
  );
  if (r.ok) {
    const rows = await r.json();
    lastStatus = rows[0];
    if (rows[0]?.payment_status === 'PAID') {
      paid = true;
      break;
    }
  }
  await new Promise((res) => setTimeout(res, 2_000));
}

if (!paid) {
  console.error('✗ order never reached PAID; last seen:', lastStatus);
  console.error('  Check: STRIPE_WEBHOOK_SECRET set on Vercel? Endpoint registered in Stripe dashboard?');
  process.exit(1);
}
console.log('  → payment_status: PAID ✓');
console.log('  → status:', lastStatus.status);

// Step 4: confirm idempotency row was written.
console.log('\n[4/4] Verifying stripe_events_processed has the event ...');
const evtResp = await fetch(
  `${SUPABASE_URL}/rest/v1/stripe_events_processed?event_type=eq.payment_intent.succeeded&order=processed_at.desc&limit=1`,
  { headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE } },
);
const evtJson = await evtResp.json();
if (evtJson.length === 0) {
  console.error('✗ no payment_intent.succeeded row in stripe_events_processed');
  process.exit(1);
}
console.log('  → most recent event id:', evtJson[0].id);

console.log('\n✓ SMOKE PASSED — checkout intent → Stripe confirm → webhook → order PAID round-trip works.');
