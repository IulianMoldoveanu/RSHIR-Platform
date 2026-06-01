# Background Geolocation — Post-Launch Implementation Plan (HIR Curier)

**Status**: deferred to immediately after first Google Play publish (decizie Iulian 2026-06-01).
**Reason**: `ACCESS_BACKGROUND_LOCATION` is Google Play's highest-scrutiny permission — it requires a recorded justification video + prominent in-app disclosure + a longer review. To publish fast, v1.0.0 ships **foreground-only** location (active while the courier keeps the app open during a shift). This doc is the "ca la carte" plan to add real background tracking in v1.1.0.

---

## Why we need it (the real problem v1.0.0 has)

The current native plugin is `@capacitor/geolocation` — **foreground only**. When a courier locks the phone or switches apps mid-delivery, the GPS stream dies, so:
- The dispatcher's live map freezes on the courier's last foreground position.
- Client ETA on the track page goes stale.
- Geofence "courier arrived" auto-messages may not fire.

For a delivery app this is the single most important native gap. v1.0.0 mitigates by keeping a wake-lock on the active-order screen, but that only helps while the screen is on.

---

## Recommended library

**`@transistorsoft/capacitor-background-geolocation`** (commercial, ~$300 one-time per platform, battle-tested) — OR — **`@capacitor-community/background-geolocation`** (free, MIT, lighter but you wire the persistence/sync yourself).

Recommendation: start with **`@capacitor-community/background-geolocation`** (free) since we already own the upload pipeline (`updateCourierLocationAction` + offline queue). Upgrade to Transistor only if battery/reliability on low-end Android proves insufficient in the field.

---

## Implementation steps (v1.1.0)

### 1. Install + native sync
```bash
cd apps/restaurant-courier
pnpm add @capacitor-community/background-geolocation
npx cap sync android
```

### 2. AndroidManifest permissions (generated via cap, declare in plugin config)
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```
A persistent foreground-service notification ("HIR Curier urmărește livrarea") is REQUIRED on Android 10+ for background location — this is also what satisfies Google's "prominent disclosure".

### 3. Rationale flow (Android 10+ two-step grant)
Android forces a two-step grant: first "While using" (foreground), THEN a separate OS screen for "Allow all the time". The app must:
1. Request foreground location, get it granted.
2. Show our own rationale sheet (revert `background-location-rationale.tsx` to the "Permite tot timpul" copy — it's already written, just re-enable).
3. Request background; the OS routes to the "Allow all the time" toggle.

### 4. Lifecycle binding
- **Start** background tracking on shift START + first order ACCEPTED.
- **Stop** background tracking on shift END or last active order DELIVERED.
- Never track when the courier is OFF shift (privacy + battery + GDPR data-minimisation).

### 5. Upload pipeline (already exists — reuse)
Pipe `onLocation` events into the existing `updateCourierLocationAction` (debounced ~15-30s or ~50m delta). The offline queue (`lib/proof-queue` pattern) already handles connectivity gaps — mirror it for location batches.

### 6. Battery tuning
- `distanceFilter: 50` (meters) — don't emit on every GPS tick.
- `desiredAccuracy: HIGH` only while an order is IN_TRANSIT; `MEDIUM` otherwise.
- Adaptive interval already exists in `location-tracker.tsx` (x2 @ <30% battery, x4 @ <15%) — port the same curve.

---

## Google Play compliance checklist (for the v1.1.0 submission)

- [ ] **Prominent disclosure dialog** BEFORE the OS permission prompt, explaining background location use in plain language (RO + EN). Must appear even if the OS prompt would.
- [ ] **Privacy Policy** updated to describe background location collection, retention, and that it only runs during an active shift.
- [ ] **Data Safety form**: mark Location → "Collected" + "Background" + purpose "App functionality" + "shared: No".
- [ ] **Justification video** (screen recording) showing: shift start → permission flow → live tracking on dispatcher map → shift end stops tracking. Upload in Play Console → App content → Permissions declaration.
- [ ] **Foreground-service notification** visible whenever tracking is active.
- [ ] In-app toggle for the courier to see tracking status + stop it (ties to shift state).

Expect a **longer review (3-7 days)** for the background-location declaration vs the instant-ish v1.0.0 foreground review.

---

## Files that will change in v1.1.0

- `apps/restaurant-courier/package.json` (+ plugin)
- `apps/restaurant-courier/capacitor.config.ts` (plugin config)
- `apps/restaurant-courier/src/lib/native/geolocation.ts` (background API)
- `apps/restaurant-courier/src/components/background-location-rationale.tsx` (re-enable full copy)
- `apps/restaurant-courier/src/components/location-tracker.tsx` (bind to background plugin lifecycle)
- `apps/restaurant-courier/src/app/dashboard/shift/page.tsx` (start/stop hooks)
- `apps/restaurant-courier/STORE-DEPLOYMENT.md` (background-location declaration section)
