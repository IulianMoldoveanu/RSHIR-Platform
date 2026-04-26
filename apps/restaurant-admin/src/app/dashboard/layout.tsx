import type { ReactNode } from 'react';
import {
  BellRing,
  BookOpen,
  Cable,
  ExternalLink,
  Globe,
  LayoutDashboard,
  LineChart,
  ListChecks,
  MapPin,
  Megaphone,
  Palette,
  Receipt,
  Rocket,
  Search,
  Settings,
  Sliders,
  Star,
} from 'lucide-react';
import { computeOnboardingState } from '@/lib/onboarding';
import { getActiveTenant } from '@/lib/tenant';
import { logoutAction } from './actions';
import { TenantSelector } from './tenant-selector';
import { SidebarNav, type SidebarItem } from './sidebar-nav';
import { MobileSidebar } from './mobile-sidebar';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, tenant, tenants } = await getActiveTenant();
  const onboarding = await computeOnboardingState(tenant.id);
  // Best-guess slug-based URL until TenantSummary surfaces custom_domain.
  // Owner can always paste their actual domain; this is a convenience link.
  const tenantStorefrontUrl = `https://${tenant.slug}.hir.ro`;

  const navItems: SidebarItem[] = [
    { href: '/dashboard', label: 'Acasă', icon: LayoutDashboard },
    { href: '/dashboard/orders', label: 'Comenzi', icon: Receipt },
    { href: '/dashboard/menu', label: 'Meniu', icon: BookOpen },
    { href: '/dashboard/zones', label: 'Zone livrare', icon: MapPin },
    { href: '/dashboard/promos', label: 'Coduri reducere', icon: Megaphone },
    { href: '/dashboard/reviews', label: 'Recenzii', icon: Star },
    { href: '/dashboard/analytics', label: 'Analytics', icon: LineChart },
    {
      href: '/dashboard/onboarding',
      label: 'Configurare',
      showDot: !onboarding.went_live,
      icon: Rocket,
    },
    { href: '/dashboard/settings', label: 'Setări', icon: Settings },
    { href: '/dashboard/settings/operations', label: 'Operațiuni', icon: Sliders },
    { href: '/dashboard/settings/branding', label: 'Identitate vizuală', icon: Palette },
    { href: '/dashboard/settings/domain', label: 'Domeniu', icon: Globe },
    { href: '/dashboard/settings/notifications', label: 'Notificări', icon: BellRing },
    { href: '/dashboard/settings/seo', label: 'SEO', icon: Search },
    { href: '/dashboard/settings/audit', label: 'Jurnal acțiuni', icon: ListChecks },
    { href: '/dashboard/settings/integrations', label: 'Integrări', icon: Cable },
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
        <SidebarNav items={navItems} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MobileSidebar items={navItems} />
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
