import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
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
  // getActiveTenant throws on unauthenticated / no-tenant. In a Server
  // Component an uncaught throw renders the generic 'Application error'
  // page — bad UX and worse for first-time users hitting the bare admin
  // URL. Redirect to /login (no auth) or /signup (auth but no membership).
  let active: Awaited<ReturnType<typeof getActiveTenant>>;
  try {
    active = await getActiveTenant();
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('Unauthenticated')) redirect('/login');
    if (msg.includes('not a member')) redirect('/signup');
    // Anything else: surface a readable error in the page instead of letting
    // it bubble to Next's "Application error: server-side exception (digest…)"
    // which gives the user no actionable info. Logged to function logs as well
    // so we can correlate by the same digest in Vercel.
    console.error('[dashboard/layout] unexpected getActiveTenant failure:', msg);
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 text-center">
        <div className="max-w-md rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-semibold text-zinc-900">
            Nu am putut încărca dashboard-ul
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            A apărut o eroare la rezolvarea contului tău. Detalii pentru
            depanare:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-zinc-50 p-3 text-left text-xs text-zinc-700">
            {msg || 'unknown error'}
          </pre>
          <div className="mt-4 flex justify-center gap-2 text-sm">
            <a
              href="/login"
              className="rounded-md bg-zinc-900 px-3 py-2 font-medium text-white hover:bg-zinc-800"
            >
              Încearcă din nou
            </a>
            <a
              href="/signup"
              className="rounded-md border border-zinc-300 px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Creează un restaurant
            </a>
          </div>
        </div>
      </main>
    );
  }
  const { user, tenant, tenants } = active;
  const onboarding = await computeOnboardingState(tenant.id);
  // Best-guess slug-based URL until TenantSummary surfaces custom_domain.
  // Owner can always paste their actual domain; this is a convenience link.
  // PRIMARY_DOMAIN comes from NEXT_PUBLIC_PRIMARY_DOMAIN; falls back to a
  // localhost link so the sidebar doesn't open a domain we don't own.
  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'lvh.me';
  const tenantStorefrontUrl = `https://${tenant.slug}.${primaryDomain}`;

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
