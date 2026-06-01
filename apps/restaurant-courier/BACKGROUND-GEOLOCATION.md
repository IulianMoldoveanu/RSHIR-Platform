# Background geolocation — HIR Curier (v1.1)

> **DO NOT MERGE / publish to Production until the foreground-only build is live.**
> Declaring `ACCESS_BACKGROUND_LOCATION` gates the entire Production submission
> behind Google's slow prominent-permission review (video + declaration form).
> Test it on the **Internal testing** track first.

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
The plugin's own `AndroidManifest.xml` fragment (in the npm package) is merged by
Gradle during `cap sync`, so the throwaway `android/` dir needs **no** hand-edit
and the merge survives `npx cap add android` in CI. It contributes
`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`.

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
