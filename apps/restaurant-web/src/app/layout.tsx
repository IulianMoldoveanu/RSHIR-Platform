import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { PwaInstallPrompt } from '@/components/storefront/pwa-install-prompt';
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

// Lane Q (2026-05-04): GSC verification value is filled by Iulian once the
// property is registered. Empty string keeps the meta tag tree-shaken out
// of the rendered HTML so we don't ship an empty `content=""` that GSC
// would reject as invalid.
const GSC_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '';

// Lane Q: dns-prefetch the Supabase host so storefront images + realtime
// channels skip the DNS roundtrip on cold loads. Falls back gracefully
// when env is unset (returns null in JSX → no <link> emitted).
function supabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  return {
    title: t(locale, 'meta.default_title'),
    description: t(locale, 'meta.default_description'),
    verification: GSC_VERIFICATION ? { google: GSC_VERIFICATION } : undefined,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const supaHost = supabaseHost();
  return (
    <html lang={locale} className={inter.variable}>
      <head>
        {supaHost && <link rel="dns-prefetch" href={`https://${supaHost}`} />}
        {supaHost && <link rel="preconnect" href={`https://${supaHost}`} crossOrigin="" />}
      </head>
      <body className="font-sans antialiased">
        {children}
        <PwaInstallPrompt />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
