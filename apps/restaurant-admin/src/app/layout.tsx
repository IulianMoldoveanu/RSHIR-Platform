import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@hir/ui';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HIR Restaurant Admin',
  description: 'Dashboard pentru restaurantele HIR',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
