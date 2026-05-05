import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { PwaInstallPrompt } from '@/components/storefront/pwa-install-prompt';
import { SupportPanel } from '@/components/support/support-panel';
import './globals.css';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: '#7c3aed',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  return {
    title: t(locale, 'meta.default_title'),
    description: t(locale, 'meta.default_description'),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  return (
    <html lang={locale} className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        <PwaInstallPrompt />
        <SupportPanel />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
