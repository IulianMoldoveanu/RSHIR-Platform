import type { ReactNode } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Package, Users, Wallet, Settings as SettingsIcon } from 'lucide-react';
import { logoutAction } from '../dashboard/actions';
import { requireFleetManager } from '@/lib/fleet-manager';
import { FleetNewOrderAlert } from './fleet-new-order-alert';
import { FleetShortcuts } from './fleet-shortcuts';
import { OfflineBanner } from '@/components/offline-banner';

const NAV = [
  { href: '/fleet', label: 'Privire', icon: LayoutDashboard },
  { href: '/fleet/orders', label: 'Comenzi', icon: Package },
  { href: '/fleet/couriers', label: 'Curieri', icon: Users },
  { href: '/fleet/earnings', label: 'Decontări', icon: Wallet },
  { href: '/fleet/settings', label: 'Setări', icon: SettingsIcon },
] as const;

export default async function FleetLayout({ children }: { children: ReactNode }) {
  const fleet = await requireFleetManager();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <FleetShortcuts />
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Link href="/fleet" className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ background: fleet.brandColor ?? '#7c3aed' }}
            >
              {fleet.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight text-zinc-100">
                {fleet.name}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                Dispecerat
              </span>
            </div>
          </Link>
        </div>

        {!fleet.isActive ? (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
            Flotă inactivă
          </span>
        ) : null}

        <div className="flex items-center gap-2">
          <FleetNewOrderAlert fleetId={fleet.fleetId} />

          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Ieșire
            </button>
          </form>
        </div>
      </header>

      <OfflineBanner />

      <main className="flex-1 px-4 pb-24 pt-6 sm:px-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
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
