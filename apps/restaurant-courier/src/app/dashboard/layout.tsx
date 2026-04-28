import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package, Clock, Wallet, Settings } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { logoutAction } from './actions';

const NAV = [
  { href: '/dashboard/orders', label: 'Comenzi', icon: Package },
  { href: '/dashboard/shift', label: 'Tură', icon: Clock },
  { href: '/dashboard/earnings', label: 'Câștiguri', icon: Wallet },
  { href: '/dashboard/settings', label: 'Setări', icon: Settings },
] as const;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-600 text-xs font-bold text-white">H</span>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">HIR Curier</span>
        </Link>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="hidden md:inline">{user.email}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Logout
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-6 sm:px-6">{children}</main>

      {/* Bottom nav — primary navigation on mobile (PWA target). */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white">
        <ul className="mx-auto flex max-w-xl items-stretch justify-around">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className="flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium text-zinc-600 hover:text-purple-600"
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
