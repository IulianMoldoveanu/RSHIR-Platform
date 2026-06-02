// Injects ACCESS_BACKGROUND_LOCATION into the CI-generated AndroidManifest.xml.
//
// WHY: @capacitor-community/background-geolocation's bundled manifest declares
// ACCESS_FINE/COARSE_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION
// and POST_NOTIFICATIONS — but NOT ACCESS_BACKGROUND_LOCATION. Without that
// permission Android never offers "Allow all the time", so background tracking
// is silently never granted. The app must declare it. The android/ project is
// scaffolded fresh in CI via `cap add android`, so manifest edits cannot be
// committed — this idempotent patch runs after `cap sync android` instead.
//
// Verify after a build: unzip the AAB and confirm the permission is present:
//   unzip -p app-release.aab base/manifest/AndroidManifest.xml | grep -i BACKGROUND_LOCATION
//
// Usage (from apps/restaurant-courier): node scripts/patch-android-manifest.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, '../android/app/src/main/AndroidManifest.xml');

if (!existsSync(manifestPath)) {
  console.error(
    `[patch-manifest] AndroidManifest not found at ${manifestPath} — run 'cap add/sync android' first.`,
  );
  process.exit(1);
}

let xml = readFileSync(manifestPath, 'utf8');

// Only ACCESS_BACKGROUND_LOCATION is the app's responsibility; the rest are
// already contributed by the plugin's library manifest (verified against
// @capacitor-community/background-geolocation@1.2.26). The manifest merger
// de-dupes, so re-declaring would be harmless, but we add only what's missing.
const PERMISSION = 'android.permission.ACCESS_BACKGROUND_LOCATION';

if (xml.includes(`android:name="${PERMISSION}"`)) {
  console.log('[patch-manifest] ACCESS_BACKGROUND_LOCATION already present — nothing to do.');
  process.exit(0);
}

const open = xml.match(/<manifest[^>]*>/);
if (!open || open.index === undefined) {
  console.error('[patch-manifest] could not find the <manifest> opening tag.');
  process.exit(1);
}

const line = `    <uses-permission android:name="${PERMISSION}" />`;
const at = open.index + open[0].length;
xml = `${xml.slice(0, at)}\n${line}${xml.slice(at)}`;
writeFileSync(manifestPath, xml, 'utf8');
console.log(`[patch-manifest] added:\n${line}`);
