import Link from 'next/link';
import type { ReactNode } from 'react';
import { computeOnboardingState } from '@/lib/onboarding';
import { getActiveTenant } from '@/lib/tenant';
import { logoutAction } from './actions';
import { TenantSelector } from './tenant-selector';
import { cn } from '@hir/ui';

type NavItem = {
  href: string;
  label: string;
  showDot?: boolean;
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, tenant, tenants } = await getActiveTenant();
  const onboarding = await computeOnboardingState(tenant.id);

  const navItems: NavItem[] = [
    { href: '/dashboard/onboarding', label: 'Configurare', showDot: !onboarding.went_live },
    { href: '/dashboard/menu', label: 'Meniu' },
    { href: '/dashboard/orders', label: 'Comenzi' },
    { href: '/dashboard/zones', label: 'Zone livrare' },
    { href: '/dashboard/promos', label: 'Coduri reducere' },
    { href: '/dashboard/analytics', label: 'Analytics' },
    { href: '/dashboard/settings', label: 'Setari' },
    { href: '/dashboard/settings/operations', label: 'Operațiuni' },
    { href: '/dashboard/settings/branding', label: 'Identitate vizuală' },
    { href: '/dashboard/settings/domain', label: 'Domeniu' },
    { href: '/dashboard/settings/notifications', label: 'Notificari' },
    { href: '/dashboard/settings/seo', label: 'SEO' },
    { href: '/dashboard/settings/audit', label: 'Jurnal acțiuni' },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="flex w-56 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-14 items-center border-b border-zinc-200 px-4 text-sm font-semibold tracking-tight">
          HIR Admin
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between rounded-md px-3 py-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900',
              )}
            >
              <span>{item.label}</span>
              {item.showDot && (
                <span
                  aria-label="Configurare incompletă"
                  className="h-2 w-2 rounded-full bg-amber-400"
                />
              )}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
          <TenantSelector tenants={tenants} activeTenantId={tenant.id} />

          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{user.email}</span>
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

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
