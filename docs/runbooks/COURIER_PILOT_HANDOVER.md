# HIR Curier — Pilot Operator Handover

Pre-flight checklist for the operator running the first pilot cohort
(5-10 couriers, 7-day soak) in Brașov. Every item is gated on a real
external action by Iulian or the on-call operator — agents and CI
cannot complete these.

Code state at handover: ~80 PRs shipped in F1-F10, app is feature-complete
for the pilot. What follows is the production cut-over checklist.

---

## 1. Push notifications — VAPID keys

The app emits `delivery:offered` push events through the registered
service worker. Production needs a VAPID key pair so Chrome / Firefox
trust the subscription.

- Generate key pair: `npx web-push generate-vapid-keys`
- Set Vercel env (production scope) on the courier project:
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY` (server-only, never exposed)
- Redeploy main (`vercel --prod` or auto via push to main).
- Smoke: from a paired device, tap "Trimite notificare test" on
  /dashboard/settings/notificari. The push should land within 3s with
  vibration + sound + RO copy.

Sentry alert: configure rule "courier_push_register_failed" >= 5/min
to wake the on-call.

## 2. Real-device test matrix (manual)

Before opening the pilot cohort, run the device sweep:

| Device | OS | Browser | Status |
|---|---|---|---|
| Pixel 6 | Android 14 | Chrome 130+ | ☐ |
| Galaxy A52 | Android 13 | Samsung Internet | ☐ |
| iPhone 13 | iOS 17 | Safari PWA | ☐ |
| iPhone SE 2020 | iOS 16 | Safari PWA | ☐ |

For each device:
- Install PWA to home screen.
- Verify push permission flow + arrival.
- Verify GPS permission flow + background tracking.
- Verify camera capture (proof photo).
- Run a full mock delivery (accept -> pickup -> deliver) on staging.
- Verify Sentry breadcrumbs are flowing.

## 3. Sentry alerting

The courier app has Sentry wired (sentry.client.config.ts,
sentry.server.config.ts, sentry.edge.config.ts). Operator must:

- Set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` env vars on
  Vercel so source-maps upload during build.
- Create Sentry alerts:
  - `level:error AND tags.app:courier` -> Telegram CRITICAL channel.
  - `transaction:/dashboard/orders AND p95 > 3000` -> WARN.
  - `event_count > 50 in 5m` -> warn (spike detector).
- Verify by deploying main + intentionally throwing in a debug route.

## 4. Telegram on-call rotation

The repo already has `github-webhook-intake` + Hepi bot configured
(see `reference_github_events_pipeline.md` in agent memory). For the
pilot:

- Add the 2-3 pilot operators to the @MasterHIRbot Telegram group.
- Configure who carries pager duty per night.
- Test by triggering a synthetic Sentry CRITICAL.

## 5. DPA + legal final stamp

Wife (in-house lawyer per memory) needs to sign off on:

- `apps/restaurant-courier/src/lib/legal-entity.ts` — entity disclosed.
- `/dashboard/legal/dpa` route — DPA text current and tenant-scoped.
- 30-day GPS purge cron — verify via Supabase scheduled function logs
  that rows older than 30d disappear nightly.

Operator gate: do NOT open the cohort until legal signs the DPA
acceptance log in the operator notebook.

## 6. Pilot cohort onboarding (Day 0)

For each of the 5-10 pilot couriers:

1. Create the courier profile in admin (`/admin/couriers`).
2. Send the install link to their phone (PWA install URL).
3. Walk them through the welcome carousel + first-shift tutorial
   in person on Day 0 (this is a one-time event).
4. Hand them a printed quick-reference card with:
   - Dispatcher phone number.
   - Emergency SOS button location (top-right header).
   - Earnings policy: 15 RON base + 3 RON/km after 3 km, floor 10 RON.

## 7. Soak window (Day 1-7)

Daily 30-minute operator check:

- `/admin/dashboard` — verify all couriers' shift state is sane.
- Sentry — review CRITICAL + WARN counts. Zero CRITICAL is the bar.
- `audit_log` — confirm `actor_user_id IS NOT NULL` and `tenant_id IS NOT NULL`.
- GPS purge — confirm rows >30d are deleted nightly.
- Reach out individually to any courier who:
  - Has not been online >= 24h since shift was scheduled.
  - Has any `transition_failed` events in audit_log.

End-of-week:

- Collect feedback from each courier in person.
- File a `docs/strategy/COURIER_PILOT_DEBRIEF_<date>.md` with raw notes.
- Decide go / no-go for cohort 2 (scale to 25).

## 8. Rollback / kill switch

Things that can go wrong + how to roll back:

| Symptom | Action |
|---|---|
| Mass push notification failure | Toggle `NEXT_PUBLIC_PUSH_DISABLED=true` env on Vercel, redeploy. Couriers fall back to in-app polling. |
| Critical Vercel deploy red | Revert main to last known green tag (`git revert <sha>` -> auto-deploy). |
| GPS purge cron failed >2 nights | Manually run `pg_cron` `purge_courier_locations_30d` from Supabase SQL editor; investigate cron schedule. |
| Sentry quota exhausted | Bump plan + add rate-limit on noisy events. |
| Telegram bot offline | Verify `TELEGRAM_BOT_TOKEN` is rotated and present in Vercel env; restart webhook. |

## 9. Phase D — Pharma cut-over (NOT in this pilot)

This handover covers the **restaurant** pilot only. Pharma cut-over
(retiring `HIR-PHARMA/apps/courier/` and routing pharma orders through
this unified app) is **out of scope** for the initial pilot. Plan that
as a separate cut-over after the restaurant cohort closes.

---

## Sign-off checklist

Before announcing the pilot launch, every line below must be checked
by the operator:

- [ ] VAPID keys set on Vercel production
- [ ] Push test passed on each device class
- [ ] Sentry alerts wired to Telegram CRITICAL channel
- [ ] Wife/legal signed off DPA
- [ ] Each pilot courier completed Day 0 onboarding
- [ ] GPS purge cron verified
- [ ] Rollback runbook printed and kept by on-call
- [ ] First soak-day calendar invite sent to operator(s)
