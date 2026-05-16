import 'server-only';
import Stripe from 'stripe';

// Cached clients per mode so a tenant in card_test and a tenant in card_live
// running in the same process don't share a Stripe client wired to the wrong
// secret key. 'live' is the legacy path (uses STRIPE_SECRET_KEY).
let liveClient: Stripe | null = null;
let testClient: Stripe | null = null;

export type StripeMode = 'live' | 'test';

export function getStripe(mode: StripeMode = 'live'): Stripe {
  if (mode === 'test') {
    if (testClient) return testClient;
    const key = process.env.STRIPE_SECRET_KEY_TEST;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY_TEST missing');
    }
    testClient = new Stripe(key, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
      typescript: true,
    });
    return testClient;
  }
  if (liveClient) return liveClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY missing');
  }
  liveClient = new Stripe(key, {
    apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    typescript: true,
  });
  return liveClient;
}
