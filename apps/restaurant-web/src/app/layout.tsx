import type { Metadata, Viewport } from 'next';
import { Inter, Oswald, Playfair_Display, Space_Grotesk, Fraunces } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { isEmbedMode } from '@/lib/embed';
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

// Lane THEMES (2026-05-06): vertical-template fonts. Each is exposed as a
// CSS variable so the (storefront)/layout can swap heading/body fonts per
// tenant via `var(--hir-font-heading)` / `var(--hir-font-body)`. We
// instantiate all 4 unconditionally at the root because next/font requires
// font functions at module scope. `display: 'swap'` keeps FOUT minimal;
// tenants without a template fall back to Inter for both.
const playfair = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-playfair',
  display: 'swap',
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-space-grotesk',
  display: 'swap',
});
const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-fraunces',
  display: 'swap',
});
// Bold Urban style theme (2026-05-07): Oswald condensed for high-impact
// street-food / urban headings. Same instantiation-at-module-scope constraint
// as the other next/font fonts above.
const oswald = Oswald({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-oswald',
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

// Lane SEO+ (2026-05-05): twitter:site identifies the brand handle so
// embedded cards link back to the HIR account. Empty string = tag omitted
// (Twitter rejects empty `site=`). Set NEXT_PUBLIC_TWITTER_HANDLE to e.g.
// `@hir_solutions` once the account is registered.
const TWITTER_SITE = process.env.NEXT_PUBLIC_TWITTER_HANDLE || '';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  return {
    title: t(locale, 'meta.default_title'),
    description: t(locale, 'meta.default_description'),
    verification: GSC_VERIFICATION ? { google: GSC_VERIFICATION } : undefined,
    twitter: TWITTER_SITE ? { site: TWITTER_SITE, card: 'summary_large_image' } : undefined,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const supaHost = supabaseHost();
  // Lane Y5 — suppress the "install HIR" PWA prompt when rendered inside
  // an embed iframe; merchants don't want HIR install prompts on their
  // own site.
  const embed = isEmbedMode();
  const fontVars = [
    inter.variable,
    playfair.variable,
    spaceGrotesk.variable,
    fraunces.variable,
    oswald.variable,
  ].join(' ');
  return (
    <html lang={locale} className={fontVars}>
      <head>
        {supaHost && <link rel="dns-prefetch" href={`https://${supaHost}`} />}
        {supaHost && <link rel="preconnect" href={`https://${supaHost}`} crossOrigin="" />}
      </head>
      <body className="font-sans antialiased">
        {children}
        {!embed && <PwaInstallPrompt />}
        {!embed && <SupportPanel />}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
