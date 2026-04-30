import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from '@hir/ui';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HIR Restaurant Admin',
  description: 'Dashboard pentru restaurantele HIR',
  manifest: '/manifest.webmanifest',
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'HIR Admin',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={inter.variable}>
      <head>
        <meta name="theme-color" content="#7c3aed" />
      </head>
      <body className="font-sans antialiased">
        {children}
        <PwaRegister />
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
