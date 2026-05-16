# HIR Curier — courier PWA

Mobile-first Next.js 14 App Router application for HIR courier personnel. Serves both restaurant deliveries and pharma vertical orders from a single codebase. Deployed as a standalone PWA on Vercel; couriers install it on Android or iOS Safari.

---

## What this app does

- Couriers log in, start a shift (swipe-to-confirm), and see a live map of their active orders.
- Each order moves through: CREATED → OFFERED → ACCEPTED → PICKED_UP / IN_TRANSIT → DELIVERED (or CANCELLED).
- Pharma orders require additional Legea 95/2006 identity and prescription verification before the delivery swipe is enabled.
- Fleet managers get a separate `/fleet` surface to monitor couriers, manage assignments, and export earnings.
- Platform admins get `/admin/fleets` for fleet CRUD.
- An external REST API (`/api/external/orders`) lets the pharma backend (Neon/NestJS) inject pharma orders via API key.

---

## Folder structure

```
apps/restaurant-courier/
  src/
    app/                      Next.js App Router pages + layouts
      dashboard/              Courier-facing UI (shift, orders, earnings, settings)
        orders/[id]/          Order detail + swipe-action panel
        shift/                Shift start/end
        earnings/             Per-day earnings + achievement badges
        settings/             Profile + notification preferences
      fleet/                  Fleet-manager UI (orders, couriers, earnings)
        orders/[id]/          Fleet order detail with audit timeline
        couriers/[id]/        Courier profile + manager notes
      admin/                  Platform-admin UI
        fleets/               Fleet CRUD (list, detail, new)
        observability/        Courier health dashboard
      api/
        external/orders/      REST API for pharma backend injection (Bearer key)
        healthz/              Uptime probe
        version/              BUILD_TIME for deploy assertion
      login/ register/        Auth pages
      offline/                SW offline fallback page
    components/               Shared UI components
    lib/                      Pure utility modules (no React; see below)
      supabase/               Three client factories (browser, server, admin)
      push/                   Web Push registration + dispatch
      realtime/               Supabase Realtime order feed hook
      native/                 Capacitor shims (geolocation, push, preferences)
  tests/e2e/                  Playwright specs + fixtures
  public/
    manifest.webmanifest      PWA manifest (standalone, #8B5CF6 theme)
    sw-push.js                Service worker for Web Push notifications
    icon-192.png / icon-512.png
```

---

## Key flows

### Login to shift start

1. `/login` — email + password via Supabase Auth.
2. `resolveRiderMode(userId)` runs server-side on every dashboard load and determines which UI variant the courier sees (Mode A/B/C — see `lib/rider-mode.ts`).
3. Dashboard home renders a full-screen Leaflet map. Offline couriers see a swipe-to-start overlay.
4. `startShiftAction` inserts a `courier_shifts` row with `status='ONLINE'`.

### Accept → pickup → deliver

1. New orders appear in `/dashboard/orders` (real-time via `useOrderFeed` or force-dynamic server render).
2. Courier swipes `SwipeButton` to accept. `runTransitionOrQueue` (from `lib/transition-runner.ts`) tries the server action immediately; if offline it enqueues in IndexedDB (`lib/transition-queue.ts`) for replay when the connection returns.
3. Pickup swipe sets `status='PICKED_UP'`.
4. Delivery: restaurant orders show optional photo proof; pharma orders gate the delivery swipe behind pharma verification (ID photo + prescription photo). COD orders require an explicit cash-collected confirmation before the delivery swipe is enabled.
5. Each status change fires `sendWebhook` (outbound HMAC-signed callback to the third-party / pharma backend) and writes an `audit_log` row via `logAudit`.

### Pharma vertical

Pharma orders arrive via `POST /api/external/orders` (Bearer API key, idempotent on `(source_tenant_id, source_order_id)`). They carry `vertical='pharma'` and optional `pharma_metadata` (requires_id_verification, requires_prescription). Delivery requires both photos (id + prescription) stored in Supabase Storage under `courier-proofs/${orderId}/{id,prescription}`. Every view of pharma PII calls `logMedicalAccess` (5-year retention per GDPR Art.30 / Legea 95).

### Fleet manager

`/fleet` is accessible to users who appear in `courier_fleet_members` with `role='MANAGER'`. Fleet managers can see all orders assigned to their fleet, bulk-auto-assign via the scoring heuristic (`lib/auto-assign-score.ts`), invite couriers, manage notes, and export earnings as CSV.

---

## Schema references

| Table | Purpose |
|---|---|
| `courier_orders` | One row per delivery. `vertical` distinguishes restaurant vs pharma. `source_tenant_id` denormalises tenant context for audit. |
| `courier_shifts` | One ONLINE row per active shift. `last_lat/lng/last_seen_at` updated by location tracker. |
| `courier_profiles` | One row per courier user. `fleet_id` determines Mode A/B/C. `status` controls whether a courier can accept orders. |
| `courier_fleets` | Fleet entities. `slug='hir-default'` is the platform-default fleet (all solo couriers). |
| `courier_fleet_members` | `courier_user_id + fleet_id + role` — determines fleet-manager access. |
| `courier_order_secrets` | HMAC secrets for webhook callbacks (separate table so column SELECT grants on `courier_orders` do not expose them). |
| `courier_push_subscriptions` | Web Push endpoint + keys per courier. Used by `lib/push/dispatch.ts` to send order notifications. |
| `audit_log` | Action audit (shared with restaurant-admin app). `tenant_id` is derived from the courier_order → source_tenant_id chain. |
| `medical_access_logs` | Read-access audit for pharma PII. 5-year retention. |

---

## Running locally

```bash
# From the monorepo root
pnpm install

# Copy env and fill in the blanks
cp apps/restaurant-courier/.env.local.example apps/restaurant-courier/.env.local
# Required vars:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   NEXT_PUBLIC_APP_URL=http://localhost:3002

pnpm --filter @hir/courier dev
# App runs on http://localhost:3002
```

Sentry upload is skipped when `SENTRY_AUTH_TOKEN` is absent — safe for local dev. The build still runs cleanly; SDK is wired client-side via `NEXT_PUBLIC_SENTRY_DSN` if set.

---

## Running E2E tests

```bash
# Copy test env and fill in the blanks
cp apps/restaurant-courier/.env.test.example apps/restaurant-courier/.env.local
# Required vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Optional: E2E_BASE_URL (when set, skips the local dev server)
#           E2E_COURIER_EMAIL / E2E_COURIER_PASSWORD (default: courier-e2e@hir.test)
#           E2E_FLEET_ID (default: hir-default fleet)

pnpm --filter @hir/courier test:e2e
```

The fixture (`tests/e2e/fixtures/seed.ts`) is idempotent — it creates or reuses the test courier user, attaches it to the `hir-default` fleet (Mode A), and cleans up open shifts before each test. Playwright targets a Pixel 7 viewport (390x844) in `ro-RO` locale, Brasov geolocation.

Specs in order: `01-login-shift` → `02-accept-deliver` → `03-force-end-shift` → `04-avatar-upload` → `05-forgot-password` → `06-delivery-photo-upload`.

---

## Deploying

Vercel auto-deploys on merge to `main` via the `@hir-pharma/courier` filter in `vercel.json`. The Vercel project is `hir-courier` (see `.vercel/project.json`). Required Vercel env vars mirror `.env.local.example`. The build exposes `BUILD_TIME` (ISO timestamp) at `GET /api/version` for deploy smoke assertions.

Security headers are applied globally in `next.config.mjs`: `X-Frame-Options: DENY`, `Permissions-Policy: geolocation=(self)`, `nosniff`, strict referrer.
