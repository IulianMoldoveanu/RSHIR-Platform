/**
 * Capacitor configuration for the HIR Storefront native shell.
 *
 * STATUS: config staged. Capacitor packages not yet installed.
 *
 * To activate (when Iulian green-lights App Store / Play Store):
 *
 *   pnpm --filter @hir/restaurant-web add @capacitor/core
 *   pnpm --filter @hir/restaurant-web add -D @capacitor/cli
 *   pnpm --filter @hir/restaurant-web add \
 *     @capacitor/ios @capacitor/android \
 *     @capacitor/push-notifications \
 *     @capacitor/preferences \
 *     @capacitor/share \
 *     @capacitor/app \
 *     @capacitor/splash-screen @capacitor/status-bar
 *   cd apps/restaurant-web
 *   npx cap add ios      # macOS only — opens Xcode project
 *   npx cap add android  # Windows / macOS / Linux — opens Android Studio
 *   npx cap sync         # after every web build
 *
 * Pattern: hosted-webview (server.url). The WebView always loads the live
 * Vercel deployment, so web updates (menu changes, UI polish) ship instantly
 * to the installed app with no app-store resubmit.
 *
 * Tenant routing: the storefront uses subdomain-based multi-tenancy
 * (foisorul-a.hiraisolutions.ro) with a ?tenant=<slug> fallback for Vercel
 * preview URLs. The native shell loads the bare Vercel URL; tenants are
 * selected via the ?tenant=<slug> query string on first load, then persisted
 * in the selected_tenant cookie for in-app navigation.
 *
 * Deep links (hir://restaurant/{slug} + universal https://hir.ro/r/{slug})
 * are handled in src/lib/native/deep-links.ts — they navigate the WebView
 * to the correct tenant storefront page.
 *
 * Reseller note: white-label partners building a branded app for their region
 * change appId, appName, and server.url to their own Vercel project. The
 * native shims and CI workflow are theme-agnostic. See mobile/README.md.
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
  appId: 'ro.hir.storefront',
  appName: 'HIR Restaurant',
  // webDir is the Next.js static export directory. Only relevant in
  // bundled-assets mode. With server.url set (hosted-webview pattern),
  // this is a safety-net fallback.
  webDir: 'out',
  server: {
    // The live Vercel deployment. Change to a staging URL for the staging
    // native build (see mobile/README.md dual-channel section).
    // White-label resellers: replace with their own Vercel project URL.
    url: 'https://hir-restaurant-web.vercel.app',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
    allowNavigation: [
      // Tenant subdomains on the production wildcard domain.
      '*.hiraisolutions.ro',
      // Supabase project for realtime, storage, and Edge Functions.
      '*.supabase.co',
      '*.supabase.in',
      // Stripe payment elements (checkout / 3DS frames).
      '*.stripe.com',
    ],
  },
  ios: {
    // Paint under notch + home indicator (pair with safe-area-inset CSS).
    contentInset: 'always',
    // White background matches storefront light theme; avoids dark flash.
    backgroundColor: '#FFFFFF',
    // Natural scroll elasticity feels correct for a customer storefront.
    scrollEnabled: true,
  },
  android: {
    backgroundColor: '#FFFFFF',
    allowMixedContent: false,
    // Hardware back button navigates the cart / menu breadcrumb naturally.
    captureInput: true,
    windowSoftInputMode: 'adjustResize',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#FFFFFF',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      // Keep status bar visible above the app on iOS.
      overlaysWebView: false,
      style: 'DEFAULT',
      backgroundColor: '#FFFFFF',
    },
    PushNotifications: {
      // Order-status push: "Comanda ta a fost acceptată / este pe drum / a ajuns".
      // Backend: Supabase Edge Function `order-push-dispatch` sends payloads.
      // The native shim in src/lib/native/push.ts bridges the plugin to the
      // existing VAPID flow — no backend changes needed.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
