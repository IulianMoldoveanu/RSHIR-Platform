import type { Metadata } from 'next';
import { Toaster } from '@hir/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'HIR Restaurant Admin',
  description: 'Dashboard pentru restaurantele HIR',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
