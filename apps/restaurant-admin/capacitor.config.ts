/**
 * Capacitor configuration for the HIR Restaurant Admin native shell.
 *
 * STATUS: config staged. Capacitor packages not yet installed.
 *
 * To activate (when Iulian green-lights App Store / Play Store):
 *
 *   pnpm --filter @hir/restaurant-admin add @capacitor/core
 *   pnpm --filter @hir/restaurant-admin add -D @capacitor/cli
 *   pnpm --filter @hir/restaurant-admin add \
 *     @capacitor/ios @capacitor/android \
 *     @capacitor/push-notifications \
 *     @capacitor/preferences \
 *     @capacitor/app \
 *     @capacitor/splash-screen @capacitor/status-bar
 *   cd apps/restaurant-admin
 *   npx cap add ios      # macOS only — opens Xcode project
 *   npx cap add android  # Windows / macOS / Linux — opens Android Studio
 *   npx cap sync         # after every web build
 *
 * Pattern: hosted-webview (server.url). The WebView loads the live Vercel
 * deployment so new features (menu editor, order views, KDS) ship instantly
 * without a store update. Only native plugin changes require a rebuild.
 *
 * Deep links: push notifications for new orders include an order ID.
 * Tapping the notification fires `hir-admin://order/{id}` which opens
 * the order detail or KDS view directly. Handled in src/lib/native/deep-links.ts.
 *
 * Audience: restaurant OWNER and MANAGER — one-tap access to live orders,
 * KDS, and daily analytics. Not fleet managers (they use the courier app).
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
  appId: 'ro.hir.admin',
  appName: 'HIR Admin',
  webDir: 'out',
  server: {
    // The live Vercel deployment. Change to a staging URL for the staging
    // native build (see mobile/README.md dual-channel section).
    url: 'https://hir-restaurant-admin.vercel.app',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
    allowNavigation: [
      // Supabase project for realtime orders, storage, and Edge Functions.
      '*.supabase.co',
      '*.supabase.in',
    ],
  },
  ios: {
    // Paint under notch + home indicator.
    contentInset: 'always',
    // Dark background matches the admin dashboard theme.
    backgroundColor: '#0a0a0f',
    // Admin is data-heavy; disabling scroll elasticity feels more native.
    scrollEnabled: false,
  },
  android: {
    backgroundColor: '#0a0a0f',
    allowMixedContent: false,
    captureInput: true,
    windowSoftInputMode: 'adjustResize',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0a0a0f',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    PushNotifications: {
      // New-order push: "Comanda nouă #1234 — acceptă acum".
      // Tapping the notification deep-links to hir-admin://order/{id}.
      // Backend: Supabase Edge Function `admin-push-dispatch` sends payloads.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
