'use client';

import { loadStripe, type Stripe } from '@stripe/stripe-js';

let cached: Promise<Stripe | null> | null = null;

export function getStripeClient(): Promise<Stripe | null> {
  if (cached) return cached;
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    return Promise.resolve(null);
  }
  cached = loadStripe(key);
  return cached;
}
