# Background geolocation — HIR Curier (v1.1)

> **Ships in v1.0.0 (decision 2026-06-02).** Background tracking is included from
> the first release. Declaring `ACCESS_BACKGROUND_LOCATION` gates the PRODUCTION
> submission behind Google's prominent-permission review (declaration form + demo
> video, ~3-7 days) — acceptable, since the new Play account already requires a
> 14-day closed test before production. Validate the real background behaviour on
> a physical Android device DURING the closed test.

## What changed (surgical — one file)
`src/lib/native/geolocation.ts` — the **native** branch of `watchPosition()` now
uses `@capacitor-community/background-geolocation` (`addWatcher`) instead of
`@capacitor/geolocation`. That plugin runs an **Android foreground service** with
a persistent notification, so GPS fixes keep arriving when the screen is locked
or the app is backgrounded.

Everything else is unchanged: the existing `<LocationTrackerWired enabled={isOnline}
onFix={updateCourierLocationAction} />` in `dashboard/layout.tsx` still drives
start/stop and POSTs each fix — it just now receives background-capable fixes.
`getCurrentPosition()` (one-shot initial fix) still uses `@capacitor/geolocation`.

## Lifecycle
| Courier | `enabled` | watcher | foreground service |
|---|---|---|---|
| ONLINE / BUSY | true | `addWatcher` active | ON (notification visible) |
| OFFLINE | false | `removeWatcher` (cleanup fn) | OFF |

`distanceFilter: 25 m`, `stale: false`. On web/PWA the bridge falls back to
`navigator.geolocation.watchPosition` (unchanged).

## Permissions / manifest
The plugin's bundled `AndroidManifest.xml` contributes `ACCESS_FINE_LOCATION`,
`ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` and
`POST_NOTIFICATIONS` — but **NOT** `ACCESS_BACKGROUND_LOCATION`. The app must
declare that one itself, otherwise Android never offers "Allow all the time" and
background tracking is silently never granted. Because the `android/` dir is
generated fresh in CI (`cap add android`), it is injected post-`cap sync` by
**`scripts/patch-android-manifest.mjs`** (a step in
`.github/workflows/courier-android-build.yml`). Verify after a build:
`unzip -p app-release.aab base/manifest/AndroidManifest.xml | grep BACKGROUND_LOCATION`.

## Reliability — required config + known limits
- **`android.useLegacyBridge: true`** (set in `capacitor.config.ts`) is REQUIRED:
  with a hosted webview (`server.url`) the modern bridge suspends the WebView in
  the background and location callbacks halt after ~5 min. The legacy bridge keeps
  the JS context alive so fixes keep flowing.
- **Battery**: the native `distanceFilter` (25 m) is the real battery lever. The
  JS battery-adaptive throttle in `location-tracker.tsx` now only de-dupes DB
  writes — it cannot reduce the continuous GPS + foreground-service cost once
  backgrounded.
- **Aggressive-OEM battery killers** (Xiaomi/Huawei/Samsung) may kill the service.
  Mitigations: a server-side `last_seen_at` staleness watchdog flags an ONLINE
  courier whose fixes go stale; prompt the courier to disable battery optimization
  for HIR Curier; field-upgrade path is
  `@transistorsoft/capacitor-background-geolocation` (native HTTP + motion APIs).

`addWatcher({ requestPermissions: true })` performs the Android 10+ **two-step**
request (foreground first, then "Allow all the time"). If background is denied it
calls back with `error.code === 'NOT_AUTHORIZED'` → we surface a message pointing
the courier to Settings (no programmatic escalation is possible on Android 10+).

Optional: drop a monochrome 96×96 white-on-transparent PNG at
`android/app/src/main/res/drawable/ic_bg_location_notification.png` for a crisp
status-bar icon (falls back to the app icon otherwise).

## Google Play — prominent disclosure (Production review)
**Does your app access background location?** Yes.
**Which feature uses it?** Live courier location during an active shift, so the
dispatch system can offer nearby orders and customers can see the courier
approaching — continues while the phone is locked because couriers drive/ride
with the screen off.
**Why can't it be foreground-only?** A courier waiting for or en route to an order
keeps the phone pocketed; without background access the platform loses their
position and cannot dispatch fairly or show live ETA.
**In-app disclosure shown before the OS prompt?** Yes — `background-location-
rationale.tsx` explains the use + the persistent notification before requesting.

## Demo video script (60–90s, screen recording for the review)
1. Open app → Login screen → log in (test account).
2. Settings → show the in-app rationale screen explaining background location.
3. Tap **Go online** → OS dialog "while using the app" → Allow.
4. Second prompt / Settings deep-link → "Allow all the time" → enable.
5. Show the persistent foreground notification "HIR Curier — ești online".
6. Press Home (background the app) — show the notification persists.
7. Lock the screen ~10s.
8. Reopen → show the live position updated on the map (proof it tracked in bg).
9. Tap **Go offline** → notification disappears (tracking stopped).
