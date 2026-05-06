/**
 * Capacitor configuration for the HIR Curier native shell.
 *
 * STATUS: config staged. Capacitor packages not yet installed.
 *
 * To activate (when Iulian green-lights App Store / Play Store):
 *
 *   pnpm --filter @hir/restaurant-courier add @capacitor/core
 *   pnpm --filter @hir/restaurant-courier add -D @capacitor/cli
 *   pnpm --filter @hir/restaurant-courier add \
 *     @capacitor/ios @capacitor/android \
 *     @capacitor/geolocation @capacitor/push-notifications \
 *     @capacitor/preferences @capacitor/app \
 *     @capacitor/splash-screen @capacitor/status-bar
 *   cd apps/restaurant-courier
 *   npx cap add ios      # macOS only — opens Xcode project
 *   npx cap add android  # Windows / macOS / Linux — opens Android Studio
 *   npx cap sync         # after every web build
 *
 * Pattern: hosted-webview (server.url). The WebView always loads the live
 * Vercel deployment, so web updates ship instantly to the native shell with
 * no app-store resubmit. Only native plugin changes (geolocation scope,
 * push keys, new capabilities) require a rebuild + store review.
 *
 * See apps/restaurant-courier/mobile/README.md for the full store-submission
 * checklist (Apple Developer account, signing certs, screenshots, etc.).
 *
 * NOTE: CapacitorConfig is inlined as a local interface so this file
 * typechecks without @capacitor/cli installed. When Capacitor is installed,
 * replace the local interface with:
 *   import type { CapacitorConfig } from '@capacitor/cli';
 */

interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir?: string;
  server?: {
    url?: string;
    androidScheme?: string;
    iosScheme?: string;
    cleartext?: boolean;
    allowNavigation?: string[];
  };
  ios?: Record<string, unknown>;
  android?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
}

const config: CapacitorConfig = {
  appId: 'ro.hir.courier',
  appName: 'HIR Curier',
  // webDir is the Next.js static export directory. Only relevant in
  // bundled-assets mode. With server.url set, this is a safety net fallback.
  webDir: 'out',
  server: {
    // The live Vercel deployment. Change to a staging URL for the staging
    // native build (see mobile/README.md dual-channel section).
    url: 'https://courier-beta-seven.vercel.app',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
    // Allow Supabase Edge Functions and API to be called from the WebView.
    allowNavigation: ['*.supabase.co', '*.supabase.in'],
  },
  ios: {
    // Paint under notch + home indicator (pair with safe-area-inset CSS).
    contentInset: 'always',
    // Match brand dark background to avoid white flash on launch.
    backgroundColor: '#0A0A0F',
    // Scroll elasticity feels wrong for a courier dashboard. Disable it.
    scrollEnabled: false,
  },
  android: {
    backgroundColor: '#0A0A0F',
    allowMixedContent: false,
    // Hardware back button navigates the WebView history.
    captureInput: true,
    // Keyboard resize mode: body only (avoids WebView resize on focus).
    windowSoftInputMode: 'adjustResize',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0A0A0F',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Overlay on iOS so the app paints under the status bar.
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    PushNotifications: {
      // Token-based push (FCM on Android, APNs on iOS). The Supabase Edge
      // Function `courier-push-dispatch` sends the payloads. When Capacitor
      // is installed, the native shim in src/lib/native/push.ts bridges the
      // Capacitor PushNotifications plugin back to the existing subscribe.ts
      // registration flow so no backend changes are needed.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Geolocation: {
      // Permission prompts are driven by Info.plist (iOS) and
      // AndroidManifest.xml (Android) — see mobile/README.md.
      // No additional plugin config needed.
    },
  },
};

export default config;
