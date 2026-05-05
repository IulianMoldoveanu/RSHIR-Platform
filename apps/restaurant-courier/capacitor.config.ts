/**
 * Capacitor configuration for the HIR Courier native shell.
 *
 * STATUS: staged, NOT YET INSTALLED. We ship this file ahead of the
 * native build so when Iulian green-lights iOS + Android distribution
 * the wrap-up is a 1-day job, not a 1-week setup.
 *
 * To activate (later):
 *   pnpm --filter @hir/restaurant-courier add -D \
 *     @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android \
 *     @capacitor/geolocation @capacitor/push-notifications \
 *     @capacitor/splash-screen @capacitor/status-bar
 *   pnpm --filter @hir/restaurant-courier exec cap init
 *   pnpm --filter @hir/restaurant-courier exec cap add ios android
 *
 * The app uses `server.url` mode (not bundled web assets). The native
 * shell is a thin WebView pointing at the live Vercel deployment, so
 * web releases ship instantly to the native shell with no app-store
 * resubmit. Only native plugins (geolocation background, push, etc.)
 * require a native rebuild.
 *
 * Reference: https://capacitorjs.com/docs/config
 *
 * NOTE: the `CapacitorConfig` type import is intentionally inlined as a
 * local interface so this file typechecks WITHOUT @capacitor/cli being
 * installed. When Capacitor lands, swap the local type for:
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
  };
  ios?: Record<string, unknown>;
  android?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
}

const config: CapacitorConfig = {
  appId: 'ro.hir.courier',
  appName: 'HIR Curier',
  // `out` is the Next.js export directory. Only used in fallback mode
  // if `server.url` is unset. With server.url set, this is a safety net.
  webDir: 'out',
  // Live-reload from the production deploy — see header comment.
  server: {
    url: 'https://courier-beta-seven.vercel.app',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    // Match the brand purple to avoid white flash on launch.
    backgroundColor: '#0A0A0F',
  },
  android: {
    backgroundColor: '#0A0A0F',
    allowMixedContent: false,
    // Webview accepts the system back button.
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0A0A0F',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      // VAPID/FCM/APNs wiring lives outside Capacitor (Supabase Edge
      // Function `dispatch-push`). Capacitor bridges native -> JS only.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Geolocation: {
      // Permissions auto-prompt on first use. We rely on the system
      // dialog wired via Info.plist + AndroidManifest entries — see
      // NATIVE_SHELL.md for the exact strings.
    },
  },
};

export default config;
