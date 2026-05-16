# Changelog — HIR Curier

All notable changes to `apps/restaurant-courier`. Format: `## YYYY-MM-DD` — PR # + one-line description.

---

## 2026-05-16

This wave (Wave 8 / F1–F6 code-complete) ships 26 PRs across features, security hardening, mobile polish, and observability.

### Features

- **#423** feat(courier): push notification bootstrap — `PushBootstrap` client component activates SW registration and push subscription on first delivered order; gentle permission banner instead of hard prompt.
- **#424** feat(courier): live location tracker — `LocationTracker` component uses `watchPosition` during ONLINE shifts; writes `courier_shifts.last_lat/lng/last_seen_at` throttled to 1 update/sec; stops on OFFLINE.
- **#425** feat(courier): real earnings screen — per-day earnings table, this-week / this-month totals, last-5-deliveries list; replaces the static placeholder.
- **#426** feat(courier): achievement badges — `evaluateAndPersist` + `BADGE_DEFS`; seven badges (delivery_1/10/100/1000, night_courier, marathon, full_week); localStorage unlock dates + new-badge toast.
- **#427** feat(courier): delivery streak counter — `incrementStreak` / `isMilestone` (milestone every 10 deliveries, wraps at 100); triggers `AppreciationToast` after each successful deliver swipe.
- **#428** feat(courier): offline transition queue — IndexedDB queue (`lib/transition-queue.ts`) captures accept/pickup/deliver server actions when offline; `TransitionSync` sentinel replays on reconnect.
- **#429** feat(courier): offline proof queue — IndexedDB queue (`lib/proof-queue.ts`) captures photo uploads when offline; `ProofSync` replays and links URLs to the order on reconnect.
- **#430** feat(courier): pharma ID + prescription URL persistence — fixes audit gap (Legea 95/2006): uploaded id and prescription photo URLs now written to `courier_orders.id_proof_url` and `prescription_proof_url` columns.
- **#431** feat(courier): fleet bulk auto-assign — `BulkAutoAssignButton` scores all unassigned CREATED orders via `scoreCandidates`; writes `fleet.bulk_auto_assigned` audit rows; fleet managers can dispatch one click.
- **#432** feat(courier): auto-assign scoring extracted — `lib/auto-assign-score.ts` pulls the heuristic (load 60% + distance 40%) out of the inline action for unit-testability and audit metadata.
- **#433** feat(courier): fleet live map — `FleetLiveMap` Leaflet component shows all online couriers' last GPS positions on the fleet overview; refreshes via Supabase Realtime.
- **#434** feat(courier): fleet order virtual list — `FleetOrdersVirtualList` uses `react-window` to render large order lists without layout jank on low-end Android.
- **#435** feat(courier): fleet order search — `FleetOrdersSearch` filters by customer name, address, or external ref; debounced client-side to avoid hammering the DB.
- **#436** feat(courier): fleet new-order alert — `FleetNewOrderAlert` plays a short chime + vibration pattern when a CREATED order enters the fleet's realtime feed.
- **#437** feat(courier): medical access timeline — `MedicalAccessTimeline` on fleet order detail shows every `medical_access_logs` read event for pharma orders; visible to fleet managers and platform admins.
- **#438** feat(courier): courier health observability page — `/admin/observability/courier-health` shows per-fleet online count, last-seen timestamps, and pending webhook failure counts.
- **#439** feat(courier): vehicle selector component — `VehicleSelector` used in registration and settings edit to pick BIKE / SCOOTER / CAR; renders vehicle icon inline.

### Polish

- **#440** polish(courier): battery saver badge — `BatterySaverBadge` warns couriers when browser Battery Status API reports < 20%; overlay on the map home screen.
- **#441** polish(courier): earnings projection card — `_projection-card.tsx` shows estimated end-of-month earnings based on current daily average; next to the streak card.
- **#442** polish(courier): best-day card — `_best-day-card.tsx` shows the courier's highest-earning single day in the last 30 days.
- **#443** polish(courier): copy address button — `CopyAddressButton` one-tap clipboard copy for pickup / dropoff addresses; falls back gracefully if Clipboard API is unavailable.

### Bug fixes

- **#444** fix(courier): active order sort urgency — dashboard home now surfaces IN_TRANSIT before PICKED_UP before ACCEPTED so the rider always sees the most urgent next action first (was newest-first, which buried a 12-min-old PICKED_UP behind a fresh ACCEPTED).
- **#445** fix(courier): audit_log NOT NULL constraint — `logAudit` now derives `tenant_id` from `courier_orders.source_tenant_id` (fast path) or the two-hop restaurant_orders chain; pharma + fleet-level events are skipped without CI noise.
- **#446** fix(courier): e2e fixture flake — `cleanupAssignedOrdersForCourier` added to seed; prevents stale ACCEPTED/PICKED_UP rows from leftover crashed runs matching the wrong order in `getByText`.

### Security

- **#447** sec(courier): SSRF + DNS-rebinding guard on outbound webhooks — `lib/webhook.ts` validates webhook URLs via `validateWebhookUrl` + DNS resolution check against private IPv4/IPv6 ranges before any outbound POST.
- **#448** sec(courier): webhook secret in sibling table — `courier_order_secrets` table holds HMAC secrets separate from `courier_orders`; prevents column-level SELECT grants on the main table from leaking secrets to fleet riders.
- **#449** sec(courier): security headers — `next.config.mjs` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: geolocation=(self)` on all routes.

---

## Reference

F1 = Core courier flow (login → shift → deliver)
F2 = Pharma vertical (Legea 95, medical access log)
F3 = Fleet manager surface
F4 = Push notifications + realtime
F5 = Offline resilience (transition queue + proof queue)
F6 = Earnings + achievements + gamification

All F1–F6 lanes are 100% code-complete as of 2026-05-16.
