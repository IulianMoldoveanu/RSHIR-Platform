# HIR Curier — Native Mobile Shell

**Status:** PWA live at `courier-beta-seven.vercel.app`. Capacitor config
committed. Native build is a 1-day job once Iulian green-lights it.

## Architecture: hosted-webview

The native shell is a thin Capacitor WebView that loads the live Vercel
deployment. Web changes (UI, logic, content) ship instantly to every installed
app without an app-store review. Only changes to native plugins (push keys,
geolocation scope, new capabilities) require a rebuild and store review.

## Activation runbook

### Step 1 — Install Capacitor packages (run once per repo clone)

```sh
cd apps/restaurant-courier

pnpm add @capacitor/core
pnpm add -D @capacitor/cli
pnpm add \
  @capacitor/ios \
  @capacitor/android \
  @capacitor/geolocation \
  @capacitor/push-notifications \
  @capacitor/preferences \
  @capacitor/app \
  @capacitor/splash-screen \
  @capacitor/status-bar
```

### Step 2 — Add platforms

```sh
# Run from apps/restaurant-courier/
npx cap add android   # Windows, macOS, Linux
npx cap add ios       # macOS only (requires Xcode)
```

### Step 3 — Sync after every web build

```sh
pnpm build
npx cap sync
```

### Step 4 — Open in IDE

```sh
npx cap open android   # Android Studio
npx cap open ios       # Xcode (macOS only)
```

## Iulian action items before store submission

| Item | Cost | Who | Status |
|------|------|-----|--------|
| Apple Developer Program | 99 USD / year | Iulian | NOT DONE |
| Google Play Console | 25 USD one-time | Iulian | NOT DONE |
| Firebase project + google-services.json | free | Iulian | NOT DONE |
| APNs Auth Key (.p8) from Apple Dev account | free | Iulian | NOT DONE |
| Android keystore generation | free | Dev | NOT DONE |
| Splash screen 2732x2732 PNG (designer) | ~150 EUR | Designer | NOT DONE |
| App icon 1024x1024 (designer, if not reusing 512 PNG) | included | Designer | NOT DONE |
| Privacy Policy URL (required by both stores) | free | Iulian | NOT DONE |

## Push notification keys

### Android (FCM)

1. Create a Firebase project at console.firebase.google.com.
2. Add an Android app with package name `ro.hir.courier`.
3. Download `google-services.json` and place it at
   `apps/restaurant-courier/android/app/google-services.json`.
4. Store the file content as GitHub secret `GOOGLE_SERVICES_JSON`.
5. Update the Supabase Edge Function `courier-push-dispatch` to send FCM
   payloads (using `Authorization: key=<FCM_SERVER_KEY>`) to Android devices.

### iOS (APNs)

1. In Apple Developer portal, create an APNs Auth Key (.p8).
2. Note the Key ID and Team ID.
3. Store the .p8 content as GitHub secret `APPLE_APNS_KEY_P8`.
4. Configure `capacitor.config.ts` > `plugins.PushNotifications` with the
   key ID, team ID, and bundle ID `ro.hir.courier`.
5. Update `courier-push-dispatch` to send APNs payloads to iOS devices.

## Android keystore (release signing)

Generate once and store securely. Never commit to git.

```sh
keytool -genkey -v \
  -keystore hir-courier.keystore \
  -alias hir-courier \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Then base64-encode and store as GitHub secrets:
- `ANDROID_KEYSTORE_BASE64`: `base64 -w 0 hir-courier.keystore`
- `ANDROID_KEY_ALIAS`: `hir-courier`
- `ANDROID_KEY_PASSWORD`: the key password you set
- `ANDROID_STORE_PASSWORD`: the store password you set

## iOS signing (GitHub Actions — self-hosted macOS runner)

GitHub-hosted macOS runners cost ~10x Linux. Options:

A. Self-hosted macOS runner (recommended for CI): set up a Mac Mini,
   register as GitHub Actions self-hosted runner, label it `macos-self-hosted`.
   Update the iOS job `runs-on` in `courier-mobile-build.yml`.

B. Manual: build locally on a Mac (`npx cap open ios`, archive in Xcode),
   distribute via TestFlight. Only needed for store submission, not daily dev.

C. Pay for GitHub-hosted macOS minutes (~$0.08/min). Practical for monthly
   store builds but expensive for every PR.

## Native plugin activation checklist

When native plugins are installed, the shims in `src/lib/native/` need to be
updated:

- `geolocation.ts`: uncomment the Capacitor Geolocation path.
- `push.ts`: uncomment the Capacitor PushNotifications path.
- `preferences.ts`: uncomment the Capacitor Preferences path (enables
  encrypted token storage).

Each shim has the exact lines to uncomment marked with the comment
`// Uncomment once @capacitor/<plugin> is installed:`.

## Permission strings

These are mandatory for App Store and Play Store approval.

### iOS — Info.plist additions (after `cap add ios`)

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>HIR Curier foloseste locatia pentru a afisa comenzile din apropiere si a calcula distanta pana la restaurant si client.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>HIR Curier urmareste locatia in fundal in timpul unei livrari active pentru a actualiza ETA-ul catre client. Tracking-ul se opreste automat la finalul livrarii.</string>

<key>NSCameraUsageDescription</key>
<string>HIR Curier foloseste camera pentru dovada de livrare (poza colet la predare).</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>HIR Curier salveaza dovada de livrare in galerie ca backup local.</string>
```

### Android — AndroidManifest.xml additions (after `cap add android`)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-feature android:name="android.hardware.location.gps" android:required="true" />
```

Background location (ACCESS_BACKGROUND_LOCATION) requires an in-app
rationale dialog shown before the permission prompt. This dialog is
already built into the shift-start flow in `dashboard/shift/page.tsx`.
Verify it appears on first shift start before submitting to Play Store.

## Splash screen and icon assets

Run after Capacitor is installed and a 1024x1024 master icon is ready:

```sh
pnpm dlx @capacitor/assets generate \
  --iconBackgroundColor '#0A0A0F' \
  --iconBackgroundColorDark '#0A0A0F' \
  --splashBackgroundColor '#0A0A0F' \
  --splashBackgroundColorDark '#0A0A0F'
```

This generates all required icon and splash sizes for iOS and Android from
the single master icon. Place the master at `assets/icon.png` (1024x1024).

## Dual-channel (production / staging)

To ship a staging native build pointing at a preview Vercel URL:

1. Copy `capacitor.config.ts` to `capacitor.config.staging.ts`.
2. Change `server.url` to the Vercel preview URL.
3. Build with: `CAPACITOR_CONFIG=capacitor.config.staging.ts npx cap sync`.

Production native builds always use `capacitor.config.ts` with the live URL.

## When to ship native vs PWA

The PWA (current) handles:
- Web push on Android Chrome + iOS Safari 16.4+ (with home-screen install).
- Geolocation + camera in-browser.
- Offline active-order recovery via service worker.
- Instant updates without app-store review.

Ship native when any of these are true:
- 50+ active couriers complaining about "keeps logging me out" or "no push
  when phone is locked" (iOS Safari PWA limitation before 16.4).
- A fleet manager customer asks "do you have an app on stores?" and it's
  blocking a commercial deal.
- Background geolocation tracking is needed (iOS WebView limitation).
