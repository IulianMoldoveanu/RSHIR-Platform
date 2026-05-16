# Payments migration — Stripe → Netopia / Viva Wallet

Iulian directive 2026-05-16: Stripe is excluded from RSHIR's active payment
path. Card processing now runs through **Netopia** (RO-native) or **Viva
Wallet**, picked per tenant in `/dashboard/settings/payments`.

This doc captures what changed for operators and integrators. Linked from the
deprecation responses at `/api/webhooks/stripe` and `/api/checkout/confirm`
(both return `410 Gone` with `migration_doc: '/docs/payments-migration'`).

## What stopped working

- `/api/webhooks/stripe` → returns 410 Gone. Remove the webhook endpoint from
  the Stripe Dashboard for this project; no further deliveries are accepted.
- `/api/checkout/confirm` → returns 410 Gone. Storefront no longer needs to
  call this route; the PSP webhook is the single source of truth for payment
  state.
- `getStripe()` (`apps/restaurant-web/src/lib/stripe/server.ts`) → throws on
  any call. The function and module are retained for compile compatibility
  only.
- The `stripe-connect` PSP adapter (`packages/integration-core/src/payment/`)
  is `@deprecated` and is no longer registered. `getPspAdapter('stripe_connect')`
  throws.

## Tenant settings shape

`tenants.settings.payments` now carries `mode` + `provider`:

```jsonc
{
  "payments": {
    "mode": "cod_only" | "card_sandbox" | "card_live",
    // Required when mode != 'cod_only':
    "provider": "netopia" | "viva"
  }
}
```

The legacy `card_test` mode was renamed to `card_sandbox`. Any existing
tenant rows with `mode: 'card_test'` fall back to `cod_only` until an OWNER
re-saves the mode through the admin UI.

## Environment variables

| Stripe (obsolete)            | Netopia / Viva (current)                                    |
|------------------------------|-------------------------------------------------------------|
| `STRIPE_SECRET_KEY`          | `NETOPIA_LIVE_API_KEY`, `VIVA_LIVE_API_KEY`                 |
| `STRIPE_SECRET_KEY_TEST`     | `NETOPIA_SANDBOX_API_KEY`, `VIVA_SANDBOX_API_KEY`           |
| `STRIPE_WEBHOOK_SECRET`      | `NETOPIA_WEBHOOK_SECRET` (and `VIVA_WEBHOOK_SECRET` when V2)|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | _(not needed — PSPs use hosted-checkout redirect)_   |

The provider router (`apps/restaurant-web/src/lib/payments/provider-router.ts`)
reads `<PROVIDER>_<SANDBOX|LIVE>_<SIGNATURE|API_KEY>` from `process.env` in
V1. Once per-tenant secrets are wired through the Supabase Vault pattern
established in PR #379, the env reads become a fallback.

## Feature flags

- `PSP_TENANT_TOGGLE_ENABLED=true` — honors `settings.payments.{mode,provider}`
  on the storefront. When unset, the legacy `cod_enabled` boolean drives the
  surface (CARD always enabled, COD opt-in) for backward compatibility.
- `STRIPE_DEPRECATED_HARD=true` — when set, `getStripe()` throws the
  `STRIPE_DEPRECATED_HARD` error variant immediately. Default (unset) throws
  a softer error so callers higher up the stack can fall back to COD.

## Webhook routing

- `/api/webhooks/netopia` — handled (V1 scaffold gated by `NETOPIA_ENABLED=true`).
- `/api/webhooks/viva` — TBD (lands with the Viva V2 adapter).
- `/api/webhooks/stripe` — 410 Gone. Delete the endpoint from the Stripe
  Dashboard once the cutover is complete.

## Where to look in code

- `packages/integration-core/src/payment/netopia.ts` — Netopia adapter +
  `createNetopiaCheckoutSession` helper.
- `packages/integration-core/src/payment/viva.ts` — Viva adapter +
  `createVivaCheckoutSession` helper.
- `packages/integration-core/src/payment/stripe-connect.ts` — `@deprecated`,
  not registered.
- `apps/restaurant-web/src/lib/payments/provider-router.ts` — storefront
  entry point; picks the right adapter from `(provider, mode)`.
- `apps/restaurant-admin/src/app/dashboard/settings/payments/payment-mode-client.tsx`
  — OWNER + platform-admin UI for `{mode, provider}`.
