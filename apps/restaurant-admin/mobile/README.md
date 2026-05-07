# HIR Restaurant Admin — Native Mobile Shell

**Status:** PWA live at `hir-restaurant-admin.vercel.app`. Capacitor config
committed. Native build is a 1-day job once Iulian green-lights it.

**Audience:** restaurant OWNERs and MANAGERs. Primary use case: accept
incoming orders and monitor the KDS while away from the fixed terminal.

## Architecture: hosted-webview

The native shell is a thin Capacitor WebView loading the live Vercel
deployment. New dashboard features ship instantly. Only native plugin
changes (push keys, new capabilities) require a rebuild and store review.

## Key native capability: new-order push

The most critical feature for the admin app is reliable new-order push
notifications. Restaurants must accept orders within ~3 minutes. Native
push (FCM on Android, APNs on iOS) is significantly more reliable than
web push for background delivery, especially on iOS where the browser
must be open for web push to arrive.

Push notification tap → `hir-admin://order/{id}` deep link → order detail
page opens instantly. No manual navigation needed.

## Activation runbook

### Step 1 — Install Capacitor packages

```sh
cd apps/restaurant-admin

pnpm add @capacitor/core
pnpm add -D @capacitor/cli
pnpm add \
  @capacitor/ios \
  @capacitor/android \
  @capacitor/push-notifications \
  @capacitor/preferences \
  @capacitor/app \
  @capacitor/splash-screen \
  @capacitor/status-bar
```

### Step 2 — Add platforms

```sh
npx cap add android
npx cap add ios       # macOS only
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
- `deep-links.ts`: uncomment the Capacitor App listener.

### Step 5 — Open in IDE

```sh
npx cap open android
npx cap open ios      # macOS only
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
| Privacy Policy URL | free | Iulian | NOT DONE |

Note: the Apple Developer account ($99/yr) is shared with the Storefront
and Courier apps — one account covers all three apps.

## Push notification keys

### Android (FCM)

1. Create a Firebase project at console.firebase.google.com.
2. Add an Android app with package name `ro.hir.admin`.
3. Download `google-services.json` and place it at
   `apps/restaurant-admin/android/app/google-services.json`.
4. Store the file content as GitHub secret `ADMIN_GOOGLE_SERVICES_JSON`.
5. Update the Supabase Edge Function `admin-push-dispatch` to send FCM
   payloads with the `hir-admin://order/{id}` deep-link URL in the data.

### iOS (APNs)

1. In Apple Developer portal, create an APNs Auth Key (.p8).
2. Store the .p8 content as GitHub secret `ADMIN_APPLE_APNS_KEY_P8`.
3. Configure the Capacitor PushNotifications plugin with the key ID,
   team ID, and bundle ID `ro.hir.admin`.

## Push notification payload format

The Supabase Edge Function `admin-push-dispatch` should send:

```json
{
  "title": "Comanda nouă #1234",
  "body": "Burger x2, Cartofi x1 — acceptă acum",
  "data": {
    "deepLink": "hir-admin://order/uuid-of-order",
    "orderId": "uuid-of-order"
  }
}
```

The deep-link in `data.deepLink` is handled by `src/lib/native/deep-links.ts`.

## Android keystore

```sh
keytool -genkey -v \
  -keystore hir-admin.keystore \
  -alias hir-admin \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

GitHub secrets:
- `ADMIN_ANDROID_KEYSTORE_BASE64`: `base64 -w 0 hir-admin.keystore`
- `ADMIN_ANDROID_KEY_ALIAS`: `hir-admin`
- `ADMIN_ANDROID_KEY_PASSWORD`: key password
- `ADMIN_ANDROID_STORE_PASSWORD`: store password

## iOS permission strings (Info.plist)

```xml
<key>NSUserNotificationsUsageDescription</key>
<string>HIR Admin iti trimite notificari pentru comenzi noi si alerte urgente.</string>
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
  --iconBackgroundColor '#0a0a0f' \
  --iconBackgroundColorDark '#0a0a0f' \
  --splashBackgroundColor '#0a0a0f' \
  --splashBackgroundColorDark '#0a0a0f'
```

Place the master icon at `assets/icon.png` (1024x1024).

## Dual-channel (production / staging)

1. Copy `capacitor.config.ts` to `capacitor.config.staging.ts`.
2. Change `server.url` to the Vercel preview URL.
3. Build with: `CAPACITOR_CONFIG=capacitor.config.staging.ts npx cap sync`.

## Note on icon files

`public/icon-192.png` and `public/icon-512.png` are the HIR brand icons,
copied from `apps/restaurant-web/public/` as part of the Phase 2 mobile
setup (2026-05-07). The manifest at `public/manifest.webmanifest`
references these files; without them the PWA install criteria fail.

When Iulian commissions a distinct admin icon (darker brand treatment),
replace these files. The manifest references `/icon-192.png` and
`/icon-512.png` by path — no manifest update needed, just replace the PNGs.
