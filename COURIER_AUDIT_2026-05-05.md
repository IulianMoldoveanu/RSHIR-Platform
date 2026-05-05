# Courier App — Deep Audit 2026-05-05

> Triple-pass audit (security · bugs · UX) on `apps/restaurant-courier/`.
> 3 sub-agents, 31 findings total. This PR fixes 4 P0/P1 issues and
> documents the rest with concrete severity + fix path.
>
> **Iulian sign-off needed** for the items in §3 before they can ship.

## §1 — Fixed in this PR

### 1.1 (P0 BUG) `markPickedUpAction` accepted any prior status
File: `dashboard/actions.ts:206`. Without an `.in('status',['ACCEPTED'])`
clause on the UPDATE, a courier could revert a DELIVERED or CANCELLED
order back to PICKED_UP and re-fire the webhook. Fixed: added the
status filter so the row is filtered out cleanly when not ACCEPTED.

### 1.2 (P0 BUG) `markDeliveredAction` allowed skipping pickup
File: `dashboard/actions.ts:221`. Same gap — a courier holding an
ACCEPTED order could swipe deliver and skip the pickup leg. Fixed
with `.in('status',['PICKED_UP','IN_TRANSIT'])`.

### 1.3 (P1 SEC) `markDeliveredAction` accepted arbitrary `proofUrl`
File: `dashboard/actions.ts:221`. Client-supplied URL went straight
into `delivered_proof_url` and was rendered in admin UIs + emitted in
webhook payloads — XSS / phishing vector. Fixed with
`isAllowedProofUrl()` mirroring the bucket-allowlist pattern from
`updateAvatarUrlAction`.

### 1.4 (P1 BUG) iOS heading=-1 snapped icon to south
File: `components/rider-map.tsx`. iOS Safari reports heading=-1 when
stationary; `Number.isFinite(-1)` is true so the icon flipped south
until next derived bearing. Fixed with `>=0 && <=360` guard plus a
`speed > 0` trustworthiness check.

### 1.5 (P1 BUG) Null Island GPS overwrote real fixes
File: `dashboard/actions.ts:280`. (0,0) passed the finite + bounds
guards. Now rejected.

### 1.6 (P1 SEC) Webhook + pharma secrets readable via wide RLS
Migration: `20260505_006_revoke_courier_secrets.sql`. Column-level
REVOKE on `courier_orders.webhook_secret` and
`courier_orders.pharma_callback_secret` for `authenticated` and
`anon`. Mirrors the pattern PR #156 used on `manager_note`.

## §2 — Confirmed clean

- **`acceptOrderAction` race**: atomic UPDATE with
  `.eq('id').eq('fleet_id').in('status').is('assigned_courier_user_id',null)`.
  Concurrent tappers lose cleanly. No fix needed.
- **Double-shift**: `uq_courier_shifts_one_online` partial unique
  index enforces single-online-shift per courier.
- **External `/api/external/orders/*`**: Bearer-auth gated,
  idempotency-keyed, SSRF-guarded. No issue.
- **Server actions**: every export under `dashboard/`, `fleet/`,
  `admin/fleets/` gated by `requireUserId` /
  `getFleetManagerContext` / `checkPlatformAdmin`. Verified.

## §3 — Deferred (NEED IULIAN SIGN-OFF)

### 3.1 (P0 SEC) Public storage buckets leak PII

**Finding**: `courier-proofs` and `courier-avatars` are
`public=true` with `for select to public using (bucket_id=...)`. Any
internet user who knows or guesses the path can fetch delivery
photos — including pharma prescription bags + recipient ID photos.
UUIDs leak via webhook payloads + customer tracking links.

**Why deferred**: switching to `public=false` + signed-URL serving
breaks every read path that hot-links the public URL today (admin
dashboards, customer tracking page, webhook subscribers). Needs a
coordinated refactor:
1. Migration: flip `storage.buckets.public` to `false`
2. New server route `/api/courier/proof/[orderId]` that mints a
   short-lived signed URL after auth check
3. Update every read site (admin order detail, customer tracking,
   pharma callback) to use the signed-URL endpoint
4. Audit existing public URLs already in subscriber webhooks (they
   stop working after migration; need migration window comms)

**Cost**: ~1 day of work + careful staging on Foișorul A first.
**Risk if unfixed**: privacy leak. Real but blast-radius is bounded
by UUID guess difficulty (extremely low for v4).

### 3.2 (P0 SEC) Unauthenticated `registerCourierAction` abuse

**Finding**: anyone on the internet can spam
`registerCourierAction` to create real `auth.users` + auto-bind to
`hir-default` fleet. Combined with §3.3, they then read all
default-fleet customer PII.

**Why deferred**: minimal fix is a rate-limit table + IP-hash
tracking — additive migration, but Iulian should decide:
- Pure rate-limit (3/h/IP) — quick win
- Switch to `email_confirm: false` so attacker needs inbox control —
  breaks current "register and login immediately" UX
- Admin-invite-only — closes the door entirely; courier registers
  from the fleet manager's invite link

I recommend **admin-invite-only** as the long-term answer, with the
self-register form retired. The "self-register" flow doesn't fit the
brand positioning ("personal, owner-controlled") anyway.

### 3.3 (P1 SEC) Wide RLS on `courier_orders`

**Finding**: any authenticated rider can `SELECT *` on every
`courier_orders` row in their fleet — including `customer_phone`,
`dropoff_line1`, `cod_amount_ron`, `pharma_metadata`. A malicious
rider in `hir-default` can dump the whole fleet's order history.

**Why deferred**: narrowing to `assigned_courier_user_id =
auth.uid() OR (assigned IS NULL AND status IN ('CREATED','OFFERED'))`
breaks the fleet manager's read path and the orders-realtime feed.
Needs:
1. Audit every read site (manager dashboard, /orders list, /orders/[id],
   realtime subscription)
2. Add a separate fleet-manager-scoped policy
3. Verify column-level grants on PII columns

**Cost**: ~3-4 hours. **Recommend doing in next sprint.**

### 3.4 (P0 UX) Stale ACCEPTED order traps courier offline

**Finding**: end-shift swipe hides while orders are active
(`page.tsx:174`). A courier with a stale ACCEPTED order they will
never deliver has no way to go offline.

**Fix**: surface "Închide tura forțat" CTA in `/dashboard/shift`
that auto-cancels stale orders + ends shift. Needs a server action
+ confirmation flow + audit log entry per cancelled order. ~1 hour.

## §4 — Not fixing (P2 or no value)

- Status enum drift across pages — partial fix in PR #220 but full
  centralization to `lib/status-labels.ts` deferred.
- `useOrderFeed` orphan code — leave for now; might be re-wired.
- Audit `tenant_id=null` on courier events — semantic, not security.
- `assertSafeOutboundUrl` DNS-rebinding TOCTOU — academic without
  inbound exploit chain.

## §5 — Suggested next sprint priority order

1. **Public bucket → signed URL** (§3.1) — privacy gate before
   onboarding any pharma tenant.
2. **Wide RLS narrowing** (§3.3) — kill the PII dump path.
3. **register-action gate** (§3.2) — admin-invite-only.
4. **Stale-order force-offline** (§3.4) — UX safety net.

Total: ~1.5 days of focused work, all gated behind Iulian sign-off.
