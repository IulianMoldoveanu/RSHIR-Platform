/**
 * Capacitor configuration for the HIR Curier native shell.
 *
 * Pattern: hosted-webview (server.url). The WebView always loads the live
 * Vercel deployment, so web updates ship instantly to the native shell with
 * no app-store resubmit. Only native plugin changes (geolocation scope,
 * push keys, new capabilities) require a rebuild + store review.
 *
 * App ID: ro.hirforyou.curier  (matches Play Store listing)
 * Production URL: https://courier.hirforyou.ro
 *
 * See apps/restaurant-courier/mobile/README.md for the full store-submission
 * checklist and STORE-DEPLOYMENT.md for the Play Store step-by-step guide.
 */

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ro.hirforyou.curier',
  appName: 'HIR Curier',
  // webDir: fallback for bundled-assets mode. In production the WebView
  // loads from server.url, so this directory is never served — it is only
  // needed so `cap sync` does not error when the android project is opened
  // for the first time before a Next.js export exists.
  webDir: 'public',
  server: {
    url: 'https://courier.hirforyou.ro',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
    allowNavigation: ['*.supabase.co', '*.supabase.in'],
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0F1115',
    scrollEnabled: false,
  },
  android: {
    backgroundColor: '#0F1115',
    allowMixedContent: false,
    captureInput: true,
    windowSoftInputMode: 'adjustResize',
    // Required by @capacitor-community/background-geolocation in a hosted
    // webview (server.url): with the modern bridge the WebView is suspended
    // when backgrounded and location callbacks halt after ~5 min. The legacy
    // bridge keeps the JS context alive so background fixes keep flowing.
    useLegacyBridge: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0F1115',
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
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Geolocation: {},
  },
};

export default config;
