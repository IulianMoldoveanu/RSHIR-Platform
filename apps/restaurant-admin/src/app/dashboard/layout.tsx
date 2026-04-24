import Link from 'next/link';
import type { ReactNode } from 'react';
import { getActiveTenant } from '@/lib/tenant';
import { logoutAction } from './actions';
import { TenantSelector } from './tenant-selector';
import { cn } from '@hir/ui';

const navItems = [
  { href: '/dashboard/menu', label: 'Meniu' },
  { href: '/dashboard/orders', label: 'Comenzi' },
  { href: '/dashboard/zones', label: 'Zone livrare' },
  { href: '/dashboard/analytics', label: 'Analytics' },
  { href: '/dashboard/settings', label: 'Setari' },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, tenant, tenants } = await getActiveTenant();

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
                'rounded-md px-3 py-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900',
              )}
            >
              {item.label}
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
