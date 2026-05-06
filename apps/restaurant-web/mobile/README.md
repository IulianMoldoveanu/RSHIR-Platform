# HIR Storefront — Native Mobile Shell

**Status:** PWA live at `hir-restaurant-web.vercel.app`. Capacitor config
committed. Native build is a 1-day job once Iulian green-lights it.

**Primary audience:** customers ordering food. Also the highest-value
reseller deliverable — a branded storefront app gives restaurant groups and
regional resellers an app-store presence under their own brand.

## Architecture: hosted-webview

The native shell is a thin Capacitor WebView that loads the live Vercel
deployment. Menu updates, UI polish, and new features ship instantly to
every installed app without an app-store review. Only changes to native
plugins (push keys, new capabilities) require a rebuild and store review.

## Reseller white-label

Resellers building a branded app for their region:

1. Fork `capacitor.config.ts` and change:
   - `appId` → `ro.<reseller>.storefront` (e.g. `ro.foodhub.storefront`)
   - `appName` → reseller brand name
   - `server.url` → reseller's Vercel project URL
2. Replace `public/icon-192.png` + `public/icon-512.png` with brand icons.
3. Build and submit under the reseller's Apple/Google developer account.
4. No backend changes — the reseller's Vercel project already has their
   tenant slug and branding configured.

This pattern allows a single codebase to power dozens of branded apps.
Theming (colors, fonts) is tenant-driven via the database and ships live.

## Activation runbook

### Step 1 — Install Capacitor packages (run once per repo clone)

```sh
cd apps/restaurant-web

pnpm add @capacitor/core
pnpm add -D @capacitor/cli
pnpm add \
  @capacitor/ios \
  @capacitor/android \
  @capacitor/push-notifications \
  @capacitor/preferences \
  @capacitor/share \
  @capacitor/app \
  @capacitor/splash-screen \
  @capacitor/status-bar
```

### Step 2 — Add platforms

```sh
# Run from apps/restaurant-web/
npx cap add android   # Windows, macOS, Linux
npx cap add ios       # macOS only (requires Xcode)
```

### Step 3 — Sync after every web build

```sh
pnpm build
npx cap sync
```

### Step 4 — Enable native shims

In `src/lib/native/`:
- `push.ts`: uncomment the Capacitor PushNotifications path.
- `preferences.ts`: uncomment the Capacitor Preferences path.
- `share.ts`: uncomment the Capacitor Share path.
- `deep-links.ts`: uncomment the Capacitor App listener.

### Step 5 — Open in IDE

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
| Splash screen 2732x2732 PNG | ~150 EUR | Designer | NOT DONE |
| App icon 1024x1024 PNG | included | Designer | NOT DONE |
| Privacy Policy URL (required by both stores) | free | Iulian | NOT DONE |

## Push notification keys

### Android (FCM)

1. Create a Firebase project at console.firebase.google.com.
2. Add an Android app with package name `ro.hir.storefront`.
3. Download `google-services.json` and place it at
   `apps/restaurant-web/android/app/google-services.json`.
4. Store the file content as GitHub secret `STOREFRONT_GOOGLE_SERVICES_JSON`.
5. Update the Supabase Edge Function `order-push-dispatch` to send FCM
   payloads to the stored device tokens.

### iOS (APNs)

1. In Apple Developer portal, create an APNs Auth Key (.p8).
2. Note the Key ID and Team ID.
3. Store the .p8 content as GitHub secret `STOREFRONT_APPLE_APNS_KEY_P8`.
4. Configure the Capacitor PushNotifications plugin with the key ID,
   team ID, and bundle ID `ro.hir.storefront`.

## Android keystore (release signing)

```sh
keytool -genkey -v \
  -keystore hir-storefront.keystore \
  -alias hir-storefront \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Store as GitHub secrets:
- `STOREFRONT_ANDROID_KEYSTORE_BASE64`: `base64 -w 0 hir-storefront.keystore`
- `STOREFRONT_ANDROID_KEY_ALIAS`: `hir-storefront`
- `STOREFRONT_ANDROID_KEY_PASSWORD`: key password
- `STOREFRONT_ANDROID_STORE_PASSWORD`: store password

## Deep links

### Universal links (iOS) — apple-app-site-association

Create `apps/restaurant-web/public/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["<TEAM_ID>.ro.hir.storefront"],
        "components": [
          { "/": "/r/*", "comment": "Restaurant pages" },
          { "/": "/track/*", "comment": "Order tracking" }
        ]
      }
    ]
  }
}
```

### App Links (Android) — assetlinks.json

Create `apps/restaurant-web/public/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ro.hir.storefront",
    "sha256_cert_fingerprints": ["<your-keystore-sha256-fingerprint>"]
  }
}]
```

Get the fingerprint: `keytool -list -v -keystore hir-storefront.keystore`

### Custom scheme (both platforms)

`hir://restaurant/{slug}` → opens `/r/{slug}`
`hir://track/{token}` → opens `/track/{token}`

Handled in `src/lib/native/deep-links.ts`.

## iOS permission strings (Info.plist)

```xml
<key>NSUserNotificationsUsageDescription</key>
<string>HIR Restaurant iti trimite notificari despre statusul comenzii tale.</string>
```

## Android permissions (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

## Splash screen and icon assets

```sh
pnpm dlx @capacitor/assets generate \
  --iconBackgroundColor '#FFFFFF' \
  --iconBackgroundColorDark '#FFFFFF' \
  --splashBackgroundColor '#FFFFFF' \
  --splashBackgroundColorDark '#FFFFFF'
```

Place the master icon at `assets/icon.png` (1024x1024, no padding).

## Dual-channel (production / staging)

To ship a staging native build pointing at a preview Vercel URL:

1. Copy `capacitor.config.ts` to `capacitor.config.staging.ts`.
2. Change `server.url` to the Vercel preview URL.
3. Build with: `CAPACITOR_CONFIG=capacitor.config.staging.ts npx cap sync`.

## iOS signing (GitHub Actions)

See the courier README for macOS runner options (self-hosted vs GitHub-hosted).
The iOS job in `storefront-mobile-build.yml` is gated with `if: false` until
an Apple Developer account and macOS runner are provisioned.
