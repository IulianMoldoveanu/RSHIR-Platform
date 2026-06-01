Stripe excluded per 2026-05-16 directive. Files kept for historical reference. Do NOT re-import without explicit re-evaluation.

## What is archived here

- `stripe-connect.ts.archived` — Stripe Connect PSP adapter (Lane PSP-MULTIGATES-V1,
  original implementation 2026-05-10). Handles direct charges on connected accounts,
  webhook HMAC-SHA256 verification, and payout status polling.

## Why it was excluded

Iulian directive 2026-05-16: Stripe Connect is excluded from the active RSHIR payment
path. Active gateways are Netopia (RO primary) and Viva (RO alternative). See
`memory/decision_stripe_excluded_2026-05-16.md` for the full rationale.

## What was removed

- `apps/restaurant-web/src/app/api/webhooks/stripe-connect/route.ts` — webhook intake
  route deleted.
- `packages/integration-core/src/index.ts` — `stripeConnectAdapter` export removed.
- `packages/integration-core/src/payment/contract.ts` — `'stripe_connect'` removed
  from `PspProviderKey` union.

## Data retention

The `stripe_payment_intent_id` column on the `orders` table is NOT dropped — existing
rows may reference historic Stripe intent IDs. A migration
(`20260601_001_stripe_column_deprecation_comment.sql`) adds a deprecation comment to
that column.

## Re-evaluation criteria

Before re-importing, an explicit decision must be made with Iulian covering:
1. Commercial agreement with Stripe (marketplace account).
2. Stripe Connect onboarding flow replacing the existing request-queue UX.
3. RO regulatory review for cross-border payment routing via Stripe.
