'use client';

/**
 * Capacitor-aware Share shim for HIR Storefront.
 *
 * "Share restaurant" surfaces in:
 *   - Restaurant menu page header (share link to this restaurant)
 *   - Order confirmation page (share your order / invite friends)
 *
 * In a native Capacitor shell, @capacitor/share uses the native OS share
 * sheet (iOS UIActivityViewController, Android Intent.ACTION_SEND), which
 * gives access to WhatsApp, Instagram, SMS, and every other app the user
 * has installed. This is dramatically more useful than Web Share API on
 * Android Chrome which only shows a subset of targets.
 *
 * Current state: browser path (Web Share API with clipboard fallback) is
 * active. The native path is commented out and ready to enable once
 * @capacitor/share is installed.
 *
 * ACTIVATION steps (see mobile/README.md):
 *   1. Install @capacitor/share.
 *   2. Uncomment the native path below.
 *   3. Run `npx cap sync`.
 *
 * No permission required — share does not need a runtime permission prompt.
 */

export interface ShareOptions {
  /** Human-readable title (shown in native share sheet). */
  title: string;
  /** Short description / caption. */
  text: string;
  /** The URL to share (restaurant page or order tracking link). */
  url: string;
  /** Optional dialog title (Android only). */
  dialogTitle?: string;
}

export type ShareResult =
  | { status: 'shared' }
  | { status: 'copied' }
  | { status: 'dismissed' }
  | { status: 'unsupported' };

/**
 * Share a restaurant page or order link.
 *
 * Native shell: opens the OS share sheet via @capacitor/share.
 * Browser: tries Web Share API, falls back to clipboard copy.
 */
export async function share(opts: ShareOptions): Promise<ShareResult> {
  // --- Native path (@capacitor/share) ---
  // Uncomment once @capacitor/share is installed:
  //
  // const { Capacitor } = await import('@capacitor/core').catch(() => ({ Capacitor: null }));
  // if (Capacitor?.isNativePlatform?.()) {
  //   const { Share } = await import('@capacitor/share');
  //   await Share.share({
  //     title: opts.title,
  //     text: opts.text,
  //     url: opts.url,
  //     dialogTitle: opts.dialogTitle ?? opts.title,
  //   });
  //   return { status: 'shared' };
  // }

  // --- Browser path (Web Share API → clipboard fallback) ---
  if (typeof navigator === 'undefined') return { status: 'unsupported' };

  if (navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return { status: 'shared' };
    } catch (err) {
      // AbortError = user dismissed the share sheet.
      if (err instanceof Error && err.name === 'AbortError') {
        return { status: 'dismissed' };
      }
      // Other error — fall through to clipboard.
    }
  }

  // Clipboard fallback for browsers without Web Share API (desktop Chrome,
  // Firefox, etc.). Copies just the URL — title + text are not applicable.
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(opts.url);
      return { status: 'copied' };
    } catch {
      // Clipboard blocked (iframe, permissions-policy). Give up gracefully.
    }
  }

  return { status: 'unsupported' };
}

/**
 * Build the canonical share URL for a restaurant.
 *
 * Uses the universal link path (/r/{slug}) so it opens the native app
 * when installed, or falls back to the web storefront.
 */
export function restaurantShareUrl(slug: string): string {
  const base =
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hir-restaurant-web.vercel.app';
  return `${base.replace(/\/+$/, '')}/r/${encodeURIComponent(slug)}`;
}
