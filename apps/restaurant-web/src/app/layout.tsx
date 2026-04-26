import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import './globals.css';

export const dynamic = 'force-dynamic';

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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
