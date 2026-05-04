# Stripe test guide — RSHIR

Lane G (2026-05-04). One-shot reference for taking Stripe live in test mode and round-tripping a real order.

## 1. Where the keys live

Three keys, populated together when you flip on test mode:

| Vault path                     | Vercel env (`hir-restaurant-web`) | Visibility |
| ------------------------------ | --------------------------------- | ---------- |
| `stripe.test.publishable_key`  | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side (safe in browser) |
| `stripe.test.secret_key`       | `STRIPE_SECRET_KEY`               | Server-side only |
| `stripe.test.webhook_secret`   | `STRIPE_WEBHOOK_SECRET`           | Server-side only |

Get them from the Stripe dashboard:

1. https://dashboard.stripe.com/test/apikeys → publishable + secret
2. https://dashboard.stripe.com/test/webhooks → "Add endpoint" → URL `https://www.foisorulalb.ro/api/webhooks/stripe` → events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`

   Click reveal on the signing secret (starts with `whsec_`) — that's the webhook secret.

## 2. Prep slots on Vercel (Chief already ran this post-merge)

```bash
node scripts/post-merge/setup-stripe-vercel-env.mjs
```

Creates the 3 env vars on `hir-restaurant-web` with placeholder
`__SET_FROM_STRIPE_DASHBOARD__`. Replace each placeholder via the Vercel UI
(or `vercel env rm` + `vercel env add`).

## 3. Vault update

Add to `C:/Users/Office HIR CEO/.hir/secrets.json`:

```json
{
  "stripe": {
    "test": {
      "publishable_key": "pk_test_...",
      "secret_key": "sk_test_...",
      "webhook_secret": "whsec_..."
    }
  }
}
```

## 4. Round-trip smoke

```bash
node scripts/smoke-stripe-checkout.mjs
```

Expects ✓ after ~5-10 s. The harness:

1. POSTs a PICKUP cart to `/api/checkout/intent`
2. Confirms the PaymentIntent with `pm_card_visa` (= `4242 4242 4242 4242`)
3. Polls `restaurant_orders.payment_status` until `PAID` lands (webhook latency ~1-3 s)
4. Verifies a row in `stripe_events_processed` for the matching `payment_intent.succeeded` event id

## 5. Test cards (Stripe canon)

| Card                    | Outcome                              |
| ----------------------- | ------------------------------------ |
| `4242 4242 4242 4242`   | Success (`pm_card_visa`)             |
| `4000 0000 0000 0002`   | `card_declined` — generic decline    |
| `4000 0000 0000 9995`   | `insufficient_funds`                 |
| `4000 0025 0000 3155`   | Requires authentication (3DS)        |
| `4000 0000 0000 3220`   | Refund partial test (post-success)   |

All test cards: any future expiry, any 3-digit CVC, any postal code.

## 6. Refund test

From the Stripe dashboard test mode → Payments → pick a successful payment →
Refund. Webhook fires `charge.refunded`, our handler flips the order to
`payment_status='REFUNDED'`. Order status is **NOT** auto-cancelled (food may
already be in transit) — restaurant admin reviews manually.

## 7. Going live

When `stripe.live.*` keys land in vault:

1. Repeat steps 2-3 with the LIVE Stripe dashboard (separate webhook endpoint!)
2. Vault keys: `stripe.live.publishable_key`, `stripe.live.secret_key`, `stripe.live.webhook_secret`
3. Smoke FIRST in a staging tenant before pointing FOISORUL A at live mode

## 8. Troubleshooting

| Symptom | Cause |
| ------- | ----- |
| `503 webhook_not_configured` | `STRIPE_WEBHOOK_SECRET` env unset on Vercel |
| `400 invalid_signature` | Webhook secret mismatch — recopy from Stripe dashboard |
| Order stuck `UNPAID` after `pm_card_visa` confirm | Webhook endpoint URL wrong or not registered |
| Duplicate orders | Should not happen — `stripe_events_processed.id` UNIQUE blocks replay |
| `stripe_events_processed` table missing | Re-run `node scripts/post-merge/setup-stripe-webhook-idempotency.mjs` |

## 9. What's NOT yet wired

Out of Lane G scope (intentional — we ship narrow):

- 3DS authentication retry UI (PaymentIntent `requires_action` → return `next_action.use_stripe_sdk` to client). Today the storefront only handles immediate-success cards.
- Partial refunds emit (we treat any `charge.refunded` as full REFUNDED — admin notes capture the partial amount manually for now).
- Stripe Connect / multi-merchant payouts. Single platform account today; per-tenant settlement is a separate sprint.
