# Sprint 11 — Integration Architecture Audit (2026-04-29)

**Audited branch:** `origin/chore/nightly-qa-2026-04-28` (commit 631c87a; the
Sprint 11 work is **not** yet on `main` — it lives on the nightly-QA branch.
Five Sprint 11 commits: `57accaf` (RSHIR-49/50/51) → `9d9edc7` (RSHIR-52) →
`75dba06` (RSHIR-53) → `f28bf2d` (transpile fix) → `2ee01b6` (smoke script)).

## Executive summary

**Verdict: PASS-WITH-WARNINGS, but one CRITICAL must be fixed before any tenant
exercises the API-key flow.**

The architecture is sound: schema is well-shaped, RLS is on, the integration-bus
short-circuits cleanly for STANDALONE tenants (zero overhead per the plan),
hooks fire after DB writes succeed, and the dispatcher implements exponential
backoff + DEAD state correctly. The Mock adapter is honest (HMAC-verified
webhook signature). One blocker (`createApiKey` insert violates `NOT NULL`
on `key_prefix` — every API-key creation in prod will 500), several leakage
issues that mirror exactly the pattern recently fixed in PR #21, partial
implementation of the menu-event hooks (only availability fires; create/update
do not), and dispatcher idempotency is best-effort only (no row-level locking).

---

## Critical issues (must-fix before merging)

### 1. `createApiKey` will 500: missing `key_prefix` in INSERT
- **File:** `apps/restaurant-admin/src/app/dashboard/settings/integrations/actions.ts:147-152`
- **What:** Migration `20260501_001_integration_core.sql:131` declares
  `key_prefix text not null` on `tenant_api_keys`. The server action inserts
  only `tenant_id, key_hash, label, scopes` — Postgres will reject this with
  `null value in column "key_prefix" violates not-null constraint`.
- **Impact:** Every OWNER click on "Generează cheie API" returns an error. The
  Mode-B (POS_PUSH) onboarding flow is dead on arrival.
- **Fix:**
  ```ts
  const raw = `hir_${randomBytes(32).toString('base64url')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  const keyPrefix = raw.slice(0, 8);   // ADD
  // …
  .insert({
    tenant_id: guard.tenantId,
    key_hash: hash,
    key_prefix: keyPrefix,             // ADD
    label,
    scopes,
  })
  ```
  Migration comment also says the prefix is "displayed in UI for
  identification" — the page select on `apps/restaurant-admin/.../page.tsx:38`
  doesn't read `key_prefix` either, so plumb it through to the table or accept
  it never shows up.

### 2. Public POST `/api/public/v1/orders` leaks DB error messages
- **File:** `apps/restaurant-web/src/app/api/public/v1/orders/route.ts:101-105, 146-150`
- **What:** On insert failure the response body includes
  `detail: custErr?.message` / `detail: orderErr?.message`. PR #21 just
  redacted exactly this pattern from the admin global-error UI; the public
  API now reintroduces it for unauthenticated/external callers, which is a
  worse audience than the admin user.
- **Impact:** A misbehaving POS or attacker probing `/api/public/v1/orders`
  with a valid bearer key sees Postgres error text (constraint names, column
  names, sometimes row hints).
- **Fix:** Return `{ error: 'order_insert_failed' }` only (no `detail`); log
  the message server-side. Mirror the pattern already used in the GET route
  on this same endpoint (lines 56-58 of `[id]/route.ts`).

---

## Warnings (should-fix, not blockers)

### W1. Menu hooks only wire availability, not create/update/delete
- **File:** `apps/restaurant-admin/src/app/dashboard/menu/actions.ts`
- **What:** Plan §"Hook wiring" called for `dispatchMenuEvent('upserted')` on
  `createItemAction` (line ~200), `updateItemAction` (line ~254), plus
  `bulkToggleAvailabilityAction` (line ~328). Only
  `toggleItemAvailabilityAction` (line 308) calls into the bus. POS adapters
  in POS_PULL / BIDIRECTIONAL mode will see availability flips but no menu
  CRUD.
- **Why it's a warning, not critical:** The Mock adapter is the only live
  adapter. Real adapters don't ship this sprint. But the chokepoint patches
  are 4 lines each — leaving them out is asking for a partial-state bug
  when the first real adapter goes live.
- **Fix:** Add `dispatchMenuEvent(tenantId, 'upserted', {...})` after the
  `insert`/`update` succeeds in `createItemAction` / `updateItemAction`, and
  `dispatchMenuEvent(tenantId, 'removed', ...)` after `deleteItemAction`.

### W2. Webhook IN does not enforce HIR-wins conflict policy
- **File:** `apps/restaurant-web/src/app/api/integrations/webhooks/[provider]/[tenant]/route.ts:108-126`
- **What:** Plan §"Webhook IN scaffold" item 3: "if HIR's `updated_at` is
  newer than the webhook's claimed `at`, ignore". The code (line 109-115)
  documents the deviation: "the Mock adapter's WebhookEvent shape doesn't
  carry an `at` timestamp today, so for MVP we simply trust the POS claim
  and write". That's fine to defer, but the contract type
  (`packages/integration-core/src/contract.ts:83`) also has no `at` field on
  `order.status_changed`, so future adapters can't supply one without a
  contract change.
- **Fix:** Either (a) add an optional `at?: string` to the
  `order.status_changed` discriminant in `WebhookEvent`, then guard the update
  with `.gt('updated_at', event.at).is.not.null()`-style logic; or (b)
  document the omission in the plan as accepted.

### W3. Webhook IN doesn't validate `event.status` against the state machine
- **File:** `apps/restaurant-web/src/app/api/integrations/webhooks/[provider]/[tenant]/route.ts:116-120`
- **What:** The webhook update writes `event.status` straight into
  `restaurant_orders.status` with no validation. The state-machine guard in
  `apps/restaurant-admin/.../orders/actions.ts:48-55` (`ALLOWED_TRANSITIONS`)
  is bypassed. A POS could push `order.status_changed` with `status='WHATEVER'`
  and corrupt the row, or move a `CANCELLED` order back to `PENDING`.
- **Fix:** Import `ALLOWED_TRANSITIONS` (or a status whitelist), reject
  unknown statuses with 422, and reject illegal transitions with 409 — same
  shape as the admin action.

### W4. Dispatcher is not idempotent under concurrent ticks
- **File:** `supabase/functions/integration-dispatcher/index.ts:161-213`
- **What:** The select-then-update pattern (`select PENDING ... limit 50`,
  iterate, `update status=SENT`) has no row-level lock or atomic claim. If
  pg_cron fires the dispatcher twice while the previous run is still in
  flight (network slowness, cold-start), both invocations pick the same
  PENDING rows and dispatch them twice. Audit log gets duplicate
  `integration.dispatched` rows. For Mock that's harmless; for any real
  adapter (future) it means duplicate POS calls.
- **Fix:** Either (a) atomically claim with
  `update integration_events set status='IN_PROGRESS' ... where id in (
    select id from integration_events where status='PENDING' ... limit 50
    for update skip locked
  ) returning *;` — requires a small RPC because supabase-js can't express
  this; or (b) accept the duplication risk for MVP-Mock and add a TODO. The
  plan implicitly assumes (a) by saying "idempotent if invoked twice".

### W5. `last_used_at` update can race / is unawaited
- **File:** `apps/restaurant-web/src/app/api/public/v1/auth.ts:62-66`
- **What:** The update is fire-and-forget (`.catch(() => {})` without await).
  Best-effort is intentional, but in the Vercel Node runtime the request can
  be torn down before the update completes. Under modest load `last_used_at`
  may be stale by hours.
- **Fix:** Either `await` it (~5-10ms cost per request, fine for a Mode B
  external POS), or batch via a fire-and-forget `pg_net.http_post` to a
  dedicated lightweight endpoint. NIT-adjacent.

### W6. `revoked_at` column unused
- **File:** `apps/restaurant-admin/src/app/dashboard/settings/integrations/actions.ts:177-183`
- **What:** Migration adds `revoked_at timestamptz` (line 137) but
  `revokeApiKey` only flips `is_active=false`. Auth check on
  `auth.ts:48-50` only checks `is_active`. The column exists for forensics
  but is never written. Fine for MVP, but odd to ship dead schema.
- **Fix:** `update({ is_active: false, revoked_at: new Date().toISOString() })`.

### W7. DEPLOY.md missing `integration_dispatcher_url` vault row instructions
- **File:** `DEPLOY.md` (no matches for `integration_dispatcher_url`)
- **What:** Cron migration `20260501_003_integration_cron.sql:11-14`
  documents the required vault row inline, but operators following
  `DEPLOY.md` won't know to seed it. Result: cron fires, `decrypted_secret`
  returns NULL, `pg_net.http_post(url:=NULL, ...)` errors silently → events
  never drain.
- **Fix:** Add a 5-line section to `DEPLOY.md` near the existing
  `notify_new_order_secret` block listing the new vault rows for Sprint 11.

### W8. Public POST orders does not persist `customer_addresses`
- **File:** `apps/restaurant-web/src/app/api/public/v1/orders/route.ts:130-145`
- **What:** The endpoint accepts `dropoff` (line1, city, lat, lng) but
  inserts `restaurant_orders` with no `delivery_address_id`. Compare with
  `intent/route.ts:99-118` which inserts a `customer_addresses` row first.
- **Impact:** Orders created via Mode B can't be courier-dispatched
  (`order-finalize.ts:123` short-circuits when `delivery_address_id` is null
  or `customer_addresses` join is null). The dropoff coords are silently
  discarded.
- **Fix:** Mirror the `customer_addresses` insert from `intent/route.ts`.

### W9. Public GET requires `orders.read`, but `createApiKey` only grants `orders.write`
- **Files:**
  `apps/restaurant-web/src/app/api/public/v1/orders/[id]/route.ts:20`
  `apps/restaurant-admin/src/app/dashboard/settings/integrations/actions.ts:202`
  `apps/restaurant-admin/src/app/dashboard/settings/integrations/client.tsx:202`
- **What:** Default API keys ship with `['orders.write']` only (action,
  client). GET enforces `orders.read`. Result: a tenant who generates a key
  via the UI cannot read back order status — only POST. The route exists
  and is documented as part of Mode B but is unreachable with default
  credentials.
- **Fix:** Either (a) include `'orders.read'` in the default scopes, or (b)
  expose a scopes selector in `CreateApiKeyForm` (the comment at client.tsx:230
  even says "implicit — singura opțiune MVP", confirming the gap).

---

## Nits (nice-to-have)

### N1. Dispatcher 500 leaks `pickErr.message`
- **File:** `supabase/functions/integration-dispatcher/index.ts:170`
- **Fix:** Drop the `detail` field; the operator can read the `console.error`
  on line 169 in Supabase logs.

### N2. Migration numbering gap (`20260501_002`)
- **What:** Migrations jump from `_001_integration_core` to
  `_003_integration_cron`. Probably intentional reservation, but flagging in
  case it's an aborted file.

### N3. `addProvider` accepts arbitrary `providerKey` string from client
- **File:** `apps/restaurant-admin/src/app/dashboard/settings/integrations/actions.ts:66-88`
- **What:** Server action takes `providerKey: string` and inserts directly.
  The DB `CHECK` constraint catches unknown keys, but the error path returns
  the raw Postgres message via `error: error.message` (line 88). UI is the
  only client today and it dropdown-restricts the values, but server-side
  whitelist would be safer.
- **Fix:** Validate against the same `KNOWN_PROVIDERS` array used in
  `webhooks/[provider]/[tenant]/route.ts:20`.

### N4. Both `integration-bus.ts` files are near-twins, slight drift
- **Files:** `apps/restaurant-admin/src/lib/integration-bus.ts`,
  `apps/restaurant-web/src/lib/integration-bus.ts`
- **What:** The admin twin uses `logAudit` helper; the web twin re-implements
  the audit insert inline (lines 50-67) because the web app has no
  `lib/audit.ts`. Functional parity is maintained. No fix required, but a
  shared helper in `packages/integration-core/server/` would reduce drift
  surface.

### N5. No unit tests for Mock adapter (RSHIR-50 deliverable)
- **What:** Plan: "Unit tests for Mock". `packages/integration-core/` has
  no `test/` or `*.test.ts` files. There is a `scripts/smoke-integration.sh`
  end-to-end harness instead, which is good but not a substitute. Given the
  Mock adapter does most of the HMAC verification logic that future real
  adapters will lean on, it's the highest-leverage code in the package to
  unit-test.

### N6. `console.log` in production paths
- **Files:** `integration-bus.ts` (multiple `console.error`),
  `webhooks/.../route.ts:97-99` (uses console for the adapter's `log`
  callback).
- **What:** The repo doesn't appear to standardize a logger; existing code
  uses `console.error` freely. So this is consistent with the codebase, not
  worse. Flagging only because the plan checklist mentions "no console.log
  in production paths".

---

## Pass items (confirmed)

- Schema: `integration_events_pending_idx` partial index exists
  (`20260501_001:99-100`). RLS enabled on all three new tables. Cleanup
  migration deletes SENT > 90 days exactly per plan.
- Adapter registry throws clearly on unknown keys
  (`packages/integration-core/src/adapters/registry.ts:14-17`).
- Mock `verifyWebhook` enforces a reproducible HMAC-SHA256 with constant-time
  compare (`mock.ts:43-87`).
- `dispatchOrderEvent` is wired AFTER the order DB insert succeeds in both
  `intent/route.ts:145-208` and `order-finalize.ts:32-66`. STANDALONE
  short-circuits at `integration-bus.ts:79` with no event row inserted.
- Dispatcher: exponential backoff with cap (`index.ts:48-53`), MAX_ATTEMPTS=5
  → DEAD (`index.ts:97-102`), DEAD rows are never re-fetched (status filter
  is strict `'PENDING'` only).
- Service-role key never reaches client bundles (`integration-bus.ts:10`
  marks `'server-only'`; `supabase-admin.ts` reads `process.env`).
- Webhook IN: raw body (`req.text()`) is what gets HMAC-verified, not parsed
  JSON (`webhooks/.../route.ts:84`).
- `webhook_secret` is server-only (page select on `page.tsx:32` excludes it,
  and the column has no client-readable RLS policy).
- API key shown once at creation (`client.tsx:259-308` modal flow).
- Sidebar entry "Integrări" wired (`apps/restaurant-admin/.../layout.tsx:82`).
- Public API rejects malformed payloads with 400 + zod issues
  (`orders/route.ts:64-69`).
- Constant-time secret compare in dispatcher (`index.ts:146-149`).

---

## Audit metadata

- Audited 17 files listed in the task brief plus 4 supporting files (logger,
  supabase-admin, layout, smoke script).
- Did not run tests, did not deploy, did not modify any Sprint 11 source.
- Sprint 11 is on `chore/nightly-qa-2026-04-28`, not `main` — the assertion
  in the prompt that it lives on `main` was off; merge has not happened yet.
