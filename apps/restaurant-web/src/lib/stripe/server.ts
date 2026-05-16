import 'server-only';

// Iulian directive 2026-05-16: Stripe is excluded from the active RSHIR
// payment path. Card processing goes through Netopia or Viva Wallet only.
// See `memory/decision_stripe_excluded_2026-05-16.md` and the migration
// notes in `docs/payments-migration.md`.
//
// This module is intentionally retained as a compile-time stub so existing
// imports (`@/lib/stripe/server`) keep type-checking; at runtime any call
// throws loudly. Two failure modes:
//   * STRIPE_DEPRECATED_HARD=true → throw immediately (production posture)
//   * default → throw with a softer error so callers higher up the stack
//     can fall back to COD without crashing the request
//
// The module no longer pulls in the `stripe` SDK — `getStripe()` returning
// never means no Stripe client is ever constructed in this process.

export type StripeMode = 'live' | 'test' | 'sandbox';

const HARD = 'STRIPE_DEPRECATED_HARD';

const SOFT_MSG =
  'Stripe is deprecated in RSHIR — use Netopia or Viva. See decision_stripe_excluded_2026-05-16.';
const HARD_MSG =
  'STRIPE_DEPRECATED_HARD=true — Stripe path is permanently disabled in RSHIR. Use Netopia or Viva.';

export function isStripeDeprecatedHard(): boolean {
  return process.env[HARD] === 'true';
}

/**
 * @deprecated Stripe is excluded from the active payment path. Calls throw.
 * Callers should resolve a PSP provider via `@/lib/payments/provider-router`
 * and dispatch to Netopia or Viva instead.
 */
export function getStripe(_mode?: StripeMode): never {
  if (isStripeDeprecatedHard()) {
    throw new Error(HARD_MSG);
  }
  throw new Error(SOFT_MSG);
}
