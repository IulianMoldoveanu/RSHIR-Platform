# Courier App Audit — 2026-05-03

**Scope**: `apps/restaurant-courier/` at `IulianMoldoveanu/RSHIR-Platform@f720d4f5` (Wave 5).
**Context**: Brașov pilot prep, FOISORUL A onboarding in progress.
**Auditor**: AI CEO Coordinator session.

---

## Verdict

The courier app has a **complete vertical structure** (login → shift → orders → detail → action → delivered with photo proof). Vertical-aware (restaurant + pharma) per the 2026-04-29 unification. PWA bones present (manifest, SW, theme). But three of the most distribution-critical pieces are **shipped as code yet not wired**:

- ✅ Push notification SW + subscribe code exist — ❌ never called from the app, so couriers never receive a push.
- ✅ `courier_shifts.last_lat/lng/last_seen_at` columns exist — ❌ no code writes them, so customers never see courier position on the track page.
- 🟡 Earnings page is a placeholder copy block — real per-day aggregation already runs in the header `EarningsBar` and could be promoted.

Everything else is solid for pilot. The three issues above are the polish-from-near-complete-to-pilot-ready delta.

---

## Inventory

### Pages

| Path | Status | Notes |
|---|---|---|
| `/login` | ✅ Shipped | Email + password, register link, registered=1 toast. |
| `/register` | ✅ Shipped | Form with full_name + phone + vehicle_type + email + password. |
| `/dashboard` (home) | ✅ Shipped | Quiet UI: shift offline → swipe-to-start; shift online + active order → redirect to detail; shift online + idle → "în așteptare" pulsing card. |
| `/dashboard/orders` | ✅ Shipped | Two sections (mine + available), refresh button, list items. |
| `/dashboard/orders/[id]` | ✅ Shipped | Pickup card, timeline, dropoff card, items, total, payment, action panel. Vertical-aware. |
| `/dashboard/shift` | ✅ Shipped | Online/offline state with start/end button. |
| `/dashboard/earnings` | 🟡 Placeholder | Static copy "Calculul câștigurilor va fi disponibil în următorul update". Real data already exists per-day in EarningsBar. |
| `/dashboard/settings` | 🟡 Read-only | Profile shown, "Editare" says "Vine în următorul update — contactează suportul". |
| `/admin/fleets/*` | ✅ Shipped | Platform-admin scoped fleet CRUD (list, detail, new). |
| `/api/external/orders` (POST + [id] GET + cancel) | ✅ Shipped | Bearer-API-key auth, idempotency via (source_tenant_id, source_order_id), webhook callback subscription, fire-and-forget push dispatch. |

### Components

| File | Purpose | Status |
|---|---|---|
| `swipe-button.tsx` | Wolt-style slide-to-confirm | ✅ Solid (framer-motion, vibration, error reset). |
| `order-timeline.tsx` | 5-stage vertical timeline with pulsing current dot | ✅ Solid. |
| `pharma-checks.tsx` | Legea 95/2006 ID + prescription gating | ✅ Shipped, gates the delivery swipe. |
| `photo-proof-upload.tsx` | Camera capture → Supabase Storage → public URL returned to action | ✅ Shipped, vertical-aware (single optional slot for restaurant; required slots for pharma). |
| `vertical-badge.tsx` | "🍕 Restaurant" / "💊 Farmacie" pill | ✅ Shipped. |
| `nav-buttons.tsx` | `geo:` MapLink + `tel:` PhoneLink | ✅ Solid. |
| `earnings-bar.tsx` | Today's net + count + online/offline | ✅ Server-rendered, lives in header. |

### Lib

| File | Purpose | Status |
|---|---|---|
| `lib/supabase/{server,browser,admin}.ts` | Three client factories | ✅ Standard. |
| `lib/realtime/order-feed.ts` | `useOrderFeed(fleetId)` hook with backoff reconnect | ✅ Shipped — but `/dashboard/orders` uses server-rendered queries, NOT this hook. The hook is dormant. |
| `lib/push/register-sw.ts` | Asks Notification permission + registers SW | 🚨 **NEVER CALLED.** |
| `lib/push/subscribe.ts` | Gets PushSubscription + POSTs to `courier-push-register` Edge Function | 🚨 **NEVER CALLED.** |
| `lib/push/dispatch.ts` | Server-side fire-and-forget Edge Function call on order create | ✅ Wired in `/api/external/orders` POST. |
| `lib/api-key.ts` | Bearer-token auth for external API | ✅ Shipped. |
| `lib/audit.ts` | Audit log helper | ✅ Shipped. |
| `lib/webhook.ts` | Outbound webhook on status change | ✅ Shipped (HMAC-signed). |
| `lib/platform-admin.ts` | Permission check | ✅ Shipped. |

### PWA

| Asset | Status |
|---|---|
| `manifest.webmanifest` | ✅ Solid. start_url=/dashboard, standalone, theme #8B5CF6, 192+512 maskable icons. |
| `sw-push.js` | ✅ Functional. Push event handler renders notification with deep-link to order; notificationclick reuses or opens window. |
| Service worker registration | 🚨 Never registered on the client. SW file exists but `navigator.serviceWorker.register` is only invoked from `register-sw.ts`, which is never imported. |
| Offline mode / replay queue | ❌ Missing. No localStorage cache of pending status updates. |

### Pharma webhook contract (cross-reference with `COURIER_WEBHOOK_CONTRACT.md`)

The Edge Function `courier-mirror-pharma` is the producer side; the courier app is purely the consumer of `courier_orders` rows it writes. App correctness:
- ✅ `vertical-badge` differentiates the two verticals visually.
- ✅ `pharma-checks` reads `pharma_metadata.requires_id_verification` + `requires_prescription` (matches webhook contract).
- ✅ `photo-proof-upload` uploads to `courier-proofs` bucket under `${orderId}/{delivery,id,prescription}` paths.
- ✅ Order detail page selects `pharma_metadata` and passes through.
- ⚠️  `markDeliveredAction` writes `delivered_proof_url` (single column) — only the **delivery** photo URL gets stored. The `id` and `prescription` photos are uploaded to Storage but their URLs are NOT persisted to DB. **Audit gap for Legea 95/2006: forensic trail of "which photo was the ID and which was the prescription" is lost.** Storage paths are deterministic so they can be reconstructed, but there's no DB row pointing at them.
- ⚠️  No `vertical='pharma'` rows in production yet (pharma side not live), so this is theoretical.

---

## Top issues sorted by user impact (and pilot blocker risk)

| # | Severity | Issue | Distribution impact |
|---|---|---|---|
| 1 | 🚨 P0 | **Push notification pipeline is dead on the client.** SW never registers, subscriptions never created. Couriers have to refresh the orders page to discover a new order — defeats the whole "instant dispatch" UX. | Pilot stability — courier responsiveness. |
| 2 | 🚨 P0 | **Courier live position never persisted.** `courier_shifts.last_lat/lng/last_seen_at` columns exist but no code writes them. Customer track page can't show courier on the map. Wolt/Glovo parity is broken. | Customer trust — #1 reason customers stay on platform vs Wolt. |
| 3 | 🟡 P1 | **Earnings page is a placeholder.** Couriers can't self-serve their day's tally; only the small header pill shows it. | Courier retention; reseller demo polish. |
| 4 | 🟡 P1 | **Pharma photo URLs (id + prescription) lost after upload.** Files land in Storage but DB stores only delivery URL. Forensic gap for Legea 95/2006. | Pharma legal — not a restaurant pilot blocker, but a hard blocker for first pharmacy go-live. |
| 5 | 🟡 P1 | **`useOrderFeed` realtime hook is dormant.** Orders list is server-rendered with `force-dynamic`; user must hit "Actualizează". Realtime would auto-push new orders into the list. | Pilot stability. |
| 6 | 🟢 P2 | **Settings page has zero edit functionality.** Profile is read-only; "contactează suportul" is the workaround. | Onboarding friction (low — Iulian seeds couriers). |
| 7 | 🟢 P2 | **No offline mode.** Status updates fail silently if courier loses signal mid-dropoff. No localStorage queue + replay. | Edge case until pilot uncovers it. |
| 8 | 🟢 P2 | **Vehicle-specific routing not used.** `vehicle_type` (BIKE/SCOOTER/CAR) is captured at registration but order assignment ignores it. Bikes get sent to 12km dropoffs. | Operational efficiency once volume grows. |
| 9 | 🟢 P2 | **No "skip" on offered order.** Courier can accept but cannot decline; an order stays in their face until they accept or someone else does. | UX friction. |
| 10 | 🟢 P3 | **Toast feedback inconsistent.** Server actions revalidate paths but don't surface a success toast (login does — actions don't). | Polish. |

---

## P1 PR plan (this session)

Three small, mergeable PRs targeting the top three issues.

### PR A — Activate push notification pipeline on courier dashboard

- New client component `<PushBootstrap />` in `dashboard/layout.tsx` that mounts after auth, gates Notification permission behind a dismissible banner ("Activează notificările pentru a primi comenzi instant"), and on accept calls `registerPushServiceWorker` + `subscribeToPush`. Stores dismissal in `localStorage` to avoid nag.
- Files: 1 new component, 1 layout edit. ~80 LOC.
- Risk: low. SW already shipped + tested. Browser permission request is standard.
- Branch: `rshir/courier-push-bootstrap`.

### PR B — Persist courier live location during shift

- New client component `<LocationTracker />` (mounted in dashboard layout) that uses `navigator.geolocation.watchPosition` while the courier has an ONLINE shift, throttled to 30s with an active order / 2min idle.
- New server action `updateCourierLocation(lat, lng)` that writes to `courier_shifts.last_lat/lng/last_seen_at` for the current ONLINE shift.
- Files: 1 new component, 1 new action, 1 layout edit. ~120 LOC. Schema ready, no migration.
- Risk: med. Battery + permission + privacy; banner UX must explain why. No PII written.
- Branch: `rshir/courier-location-tracking`.

### PR C — Real earnings screen (today / week / month)

- Replace placeholder `dashboard/earnings/page.tsx` with three server-rendered cards: today, this week (Mon-Sun), this month. Reuses the same query as `EarningsBar` with broader time bounds.
- Adds a small "ultimele 5 livrări" list at the bottom for context.
- Files: 1 page rewrite. ~100 LOC.
- Risk: low. Pure read-side; no schema change; same query pattern already in production via EarningsBar.
- Branch: `rshir/courier-earnings-real`.

---

## Stop-condition watch (what I will NOT do)

- ❌ No schema migrations. PRs B + C reuse already-shipped columns.
- ❌ No changes to `courier-mirror-pharma` Edge Function or webhook contract.
- ❌ No changes to `delivery-client` package contract.
- ❌ No `pnpm install` at root.
- ❌ No `Vercel project create` for `hir-courier-app` — explicitly deferred per Iulian.
- ❌ No deletes; if I find dead-feeling code I leave it.

---

## P2 — Vercel env audit (deferred)

If time allows after PRs land, document required env vars for the future `hir-courier-app` Vercel project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (push), `VAPID_PRIVATE_KEY` (Edge Function side, NOT app).
