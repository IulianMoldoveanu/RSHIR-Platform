# Integration adapter authoring guide

This guide explains how to add a new POS / external-system adapter to
`@hir/integration-core`. The package powers the outbound dispatch queue
(restaurant order/menu events → external systems) and the inbound
webhook router (external system → HIR via HMAC-signed POST).

## Adapter contract

Every adapter implements the `IntegrationAdapter` interface from
`packages/integration-core/src/contract.ts`:

```ts
interface IntegrationAdapter {
  readonly providerKey: ProviderKey;
  onOrderEvent(ctx, event, payload): Promise<AdapterResult>;
  onMenuEvent(ctx, event, payload): Promise<AdapterResult>;
  verifyWebhook(ctx, rawBody, headers): Promise<WebhookEvent>;
}
```

`AdapterResult` is either `{ ok: true }` or
`{ ok: false; retry: boolean; error: string }`. Use `retry: true` only
for transient conditions (network error, 5xx, 429); permanent failures
(misconfig, 4xx that won't change) should set `retry: false` so the
dispatcher marks the row DEAD instead of looping.

## File layout

```
packages/integration-core/src/
├── contract.ts          # interface + shared types
├── index.ts             # public re-exports
└── adapters/
    ├── registry.ts      # provider key → adapter map
    ├── mock.ts          # reference (no-op) implementation
    ├── custom.ts        # generic HTTPS webhook + HMAC
    ├── freya.ts         # Brașov pilot — scaffold
    ├── iiko.ts          # iiko POS — scaffold
    └── posnet.ts        # Posnet — scaffold
```

When you add a new adapter:

1. Add the `providerKey` literal to the `ProviderKey` union in
   `contract.ts`.
2. Create `adapters/<name>.ts` exporting a singleton object that
   implements `IntegrationAdapter`.
3. Register it in `adapters/registry.ts`.
4. Re-export anything user-facing (config types, helper functions) from
   `index.ts`.
5. Add the option to the admin dropdown
   (`apps/restaurant-admin/src/app/dashboard/settings/integrations/client.tsx`,
   `PROVIDER_OPTIONS`).
6. If the adapter does any actual HTTP I/O (Custom does, Mock doesn't),
   **also** add an inline branch in
   `supabase/functions/integration-dispatcher/index.ts`. See the
   limitation below.

## Deno / Edge limitation

The async dispatcher runs in Supabase's Deno Edge runtime. Today it
**cannot** import workspace packages (`@hir/*`); the bundler doesn't
follow `pnpm` workspace links. This means HTTP-doing adapters must be
implemented twice — once as a TypeScript class in the package (used by
the admin "Testează conexiunea" server action and unit tests), and
once inline in the dispatcher Edge function.

The Custom adapter in `packages/integration-core/src/adapters/custom.ts`
and the `dispatchCustom` helper in
`supabase/functions/integration-dispatcher/index.ts` are the canonical
example. Whenever you change one, change the other and re-run the
contract tests.

The day Supabase Edge supports workspace imports (or we move the
dispatcher to a Node runtime), this duplication goes away.

## Security checklist for HTTP adapters

If your adapter performs `fetch` against a tenant-supplied URL:

- [ ] **HTTPS only.** Plain `http://` is rejected at config-validation
      time.
- [ ] **SSRF guard.** Block private/loopback/link-local IP literals
      (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7,
      fe80::/10) before any fetch. See `isSafeWebhookUrl` in
      `custom.ts`.
- [ ] **HMAC signature.** Sign the body with HMAC-SHA256 using the
      tenant's `webhook_secret`; send it in `X-HIR-Signature` (hex,
      lowercase, no `sha256=` prefix). Mirror this in `verifyWebhook`
      for inbound traffic.
- [ ] **Constant-time comparison.** Use `safeEqual` (length check + XOR
      accumulator) to compare signatures. Never `===`.
- [ ] **Idempotent receiver.** Document that retries can deliver the
      same event multiple times. Suggest the receiver dedupe by
      `(event, order.orderId, event_id_from_audit)`.

## Testing

Today, package-level tests live in
`apps/restaurant-admin/src/lib/integration-*-adapter.test.ts` because
the package itself doesn't yet have a vitest harness. Place tests there
until a second adapter needs unit coverage; at that point, add
`vitest` + a `vitest.config.ts` to the package and migrate.

Cover at minimum:

- Happy path: 200 response → `{ ok: true }` and the request body has
  the expected envelope shape.
- Transient failure: 5xx / 429 → `retry: true`.
- Permanent failure: 4xx → `retry: false`.
- Network throw → `retry: true`.
- Config validation: missing fields, bad enum values, SSRF target.
- For HTTP adapters: SSRF block must `not.toHaveBeenCalled()` on
  `fetch`.

## Contract evolution

The `IntegrationAdapter` interface is **additive**. If you need a new
capability (e.g. `onPaymentEvent`), add an optional method and check
for its presence in the bus / dispatcher; do not break existing
adapters. Schema changes to the wire envelope (`event`, `test_mode`,
`order`, `delivered_at`) require a major version bump and a migration
plan for existing tenants.
