import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@hir/ui';
import { ThemeProvider, themeScriptSource } from '@/components/theme-provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HIR Curier',
  description: 'Aplicație curier HIR — comenzi, tură, câștiguri.',
  manifest: '/manifest.webmanifest',
  applicationName: 'HIR Curier',
  appleWebApp: {
    capable: true,
    title: 'HIR Curier',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: [
    { rel: 'icon', url: '/icon-192.png', sizes: '192x192' },
    { rel: 'icon', url: '/icon-512.png', sizes: '512x512' },
    { rel: 'apple-touch-icon', url: '/icon-192.png', sizes: '192x192' },
    { rel: 'apple-touch-icon', url: '/icon-512.png', sizes: '512x512' },
  ],
};

export const viewport: Viewport = {
  themeColor: '#8B5CF6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // viewport-fit=cover lets the PWA / native shell paint under the iOS
  // notch + home indicator. Pair with env(safe-area-inset-*) padding
  // in components that touch the screen edge.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline ThemeScript adds/removes the
    // `dark` class on <html> before React hydrates, so the server-rendered
    // markup and the post-hydration markup can disagree on a single class.
    // That's the intended flow — without it React would clobber the
    // pre-paint theme back to the server default and we'd see the FOUC
    // this script is designed to prevent.
    <html lang="ro" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScriptSource }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
