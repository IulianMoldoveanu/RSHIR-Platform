import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package, Clock, Wallet, Settings } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoutAction, updateCourierLocationAction } from './actions';
import { EarningsBar } from '@/components/earnings-bar';
import { LocationTracker } from '@/components/location-tracker';

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

  // Are we currently in a shift? Drives the location tracker on/off.
  const admin = createAdminClient();
  const { data: shiftData } = await admin
    .from('courier_shifts')
    .select('id')
    .eq('courier_user_id', user.id)
    .eq('status', 'ONLINE')
    .limit(1)
    .maybeSingle();
  const isOnline = !!shiftData;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 backdrop-blur">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500 text-xs font-bold text-white"
          >
            H
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">HIR Curier</span>
        </Link>

        {/* Earnings pill — always visible. */}
        <EarningsBar />

        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Ieșire
          </button>
        </form>
      </header>

      <LocationTracker enabled={isOnline} onFix={updateCourierLocationAction} />

      <main className="flex-1 px-4 pb-24 pt-6 sm:px-6">{children}</main>

      {/* Bottom nav — primary navigation on mobile (PWA target). */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <ul className="mx-auto flex max-w-xl items-stretch justify-around">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className="flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium text-zinc-400 hover:text-violet-400"
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
