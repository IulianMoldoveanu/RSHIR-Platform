import type { ReactNode } from 'react';
import {
  BookOpen,
  ExternalLink,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Rocket,
  Settings,
  Sliders,
} from 'lucide-react';
import { computeOnboardingState } from '@/lib/onboarding';
import { getActiveTenant } from '@/lib/tenant';
import { logoutAction } from './actions';
import { TenantSelector } from './tenant-selector';
import { SidebarNav, type SidebarEntry } from './sidebar-nav';
import { MobileSidebar } from './mobile-sidebar';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, tenant, tenants } = await getActiveTenant();
  const onboarding = await computeOnboardingState(tenant.id);
  // Best-guess slug-based URL until TenantSummary surfaces custom_domain.
  // Owner can always paste their actual domain; this is a convenience link.
  const tenantStorefrontUrl = `https://${tenant.slug}.hir.ro`;

  // §6 P0 — flat list grouped into 6 logical sections per audit. Onboarding
  // pinned at the top and only when not yet live (the dot indicator already
  // surfaces incompleteness — keep that). Top-level leaves render flat.
  const navEntries: SidebarEntry[] = [
    ...(onboarding.went_live
      ? []
      : [
          {
            href: '/dashboard/onboarding',
            label: 'Configurare inițială',
            showDot: true,
            icon: Rocket,
          },
        ]),
    { href: '/dashboard', label: 'Acasă', icon: LayoutDashboard },
    { href: '/dashboard/orders', label: 'Comenzi', icon: Receipt },
    { href: '/dashboard/menu', label: 'Meniu', icon: BookOpen },
    {
      label: 'Marketing',
      icon: Megaphone,
      items: [
        { href: '/dashboard/promos', label: 'Coduri reducere' },
        { href: '/dashboard/reviews', label: 'Recenzii' },
        { href: '/dashboard/analytics', label: 'Analytics' },
      ],
    },
    {
      label: 'Operațiuni',
      icon: Sliders,
      items: [
        { href: '/dashboard/zones', label: 'Zone livrare' },
        { href: '/dashboard/settings/operations', label: 'Program & pickup' },
        { href: '/dashboard/settings/notifications', label: 'Notificări' },
      ],
    },
    {
      label: 'Configurare',
      icon: Settings,
      items: [
        { href: '/dashboard/settings/branding', label: 'Identitate vizuală' },
        { href: '/dashboard/settings/domain', label: 'Domeniu' },
        { href: '/dashboard/settings/seo', label: 'SEO' },
        { href: '/dashboard/settings/integrations', label: 'Integrări' },
        { href: '/dashboard/settings/audit', label: 'Jurnal acțiuni' },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-56 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-4">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-600 text-xs font-bold text-white"
          >
            H
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">HIR</span>
        </div>
        <SidebarNav entries={navEntries} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MobileSidebar entries={navEntries} />
            <TenantSelector tenants={tenants} activeTenantId={tenant.id} />
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <a
              href={tenantStorefrontUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Vezi storefront</span>
            </a>
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

        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
