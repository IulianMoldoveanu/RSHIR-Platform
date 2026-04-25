import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getActiveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR KDS — Bucătărie',
};

export default async function KdsLayout({ children }: { children: ReactNode }) {
  try {
    await getActiveTenant();
  } catch {
    redirect('/login');
  }
  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 antialiased">
      {children}
    </div>
  );
}
