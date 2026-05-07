import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { computeOnboardingState } from '@/lib/onboarding';
import { getActiveTenant } from '@/lib/tenant';
import { tenantStorefrontUrl } from '@/lib/storefront-url';
import { logoutAction } from './actions';
import { TenantSelector } from './tenant-selector';
import { SidebarNav, type SidebarEntry } from './sidebar-nav';
import { MobileSidebar } from './mobile-sidebar';
import { PwaInstallPrompt } from '@/components/pwa-install-prompt';
import { FeedbackFab } from '@/components/feedback-fab';
import { CmdKPalette } from '@/components/cmd-k';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  let active: Awaited<ReturnType<typeof getActiveTenant>>;
  try {
    active = await getActiveTenant();
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('Unauthenticated')) redirect('/login');
    if (msg.includes('not a member')) redirect('/signup');
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
  let onboarding: Awaited<ReturnType<typeof computeOnboardingState>>;
  try {
    onboarding = await computeOnboardingState(tenant.id);
  } catch (err) {
    console.error('[dashboard/layout] onboarding probe failed:', (err as Error).message);
    onboarding = { menu_added: false, hours_set: false, zones_set: false, went_live: false, completed_at: null };
  }
  const storefrontUrl = tenantStorefrontUrl(tenant.slug);

  const isPlatformAdmin = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes((user.email ?? '').toLowerCase());

  const navEntries: SidebarEntry[] = [
    ...(onboarding.went_live
      ? []
      : [
          {
            href: '/dashboard/onboarding',
            label: 'Configurare inițială',
            showDot: true,
            icon: 'rocket' as const,
          },
        ]),
    { href: '/dashboard', label: 'Acasă', icon: 'layoutDashboard' as const },
    { href: '/dashboard/orders', label: 'Comenzi', icon: 'receipt' as const },
    { href: '/dashboard/orders/aggregator-inbox', label: 'Inbox preluare email' },
    { href: '/dashboard/menu', label: 'Meniu', icon: 'bookOpen' as const },
    {
      label: 'Marketing',
      icon: 'megaphone' as const,
      items: [
        { href: '/dashboard/promos', label: 'Coduri reducere' },
        { href: '/dashboard/marketing/newsletter', label: 'Newsletter' },
        { href: '/dashboard/reviews', label: 'Recenzii' },
        { href: '/dashboard/analytics', label: 'Analytics' },
      ],
    },
    { href: '/dashboard/ai-ceo', label: 'AI CEO', icon: 'sparkles' as const },
    { href: '/dashboard/ai-activity', label: 'Jurnal AI' },
    {
      label: 'Operațiuni',
      icon: 'sliders' as const,
      items: [
        { href: '/dashboard/zones', label: 'Zone livrare' },
        { href: '/dashboard/settings/operations', label: 'Program & pickup' },
        { href: '/dashboard/settings/notifications', label: 'Notificări' },
        { href: '/dashboard/reservations', label: 'Rezervări' },
        { href: '/dashboard/voice', label: 'Apeluri vocale' },
        { href: '/dashboard/inventory', label: 'Stocuri' },
        { href: '/kds', label: 'Ecran bucătărie (KDS)' },
      ],
    },
    // QW3 (UIUX audit 2026-05-08): split Configurare into 4 themed
    // sub-groups so the 14-leaf flat accordion stops failing the "30-second
    // test". Audit log moves out to its own top-level entry — it's an
    // observability surface, not really a setting. Order inside each
    // sub-group preserves the original sidebar order so muscle memory holds.
    {
      label: 'Configurare',
      icon: 'settings' as const,
      items: [
        {
          label: 'Identitate',
          items: [
            { href: '/dashboard/settings/branding', label: 'Identitate vizuală' },
            { href: '/dashboard/settings/presentation', label: 'Pagină de prezentare' },
            { href: '/dashboard/settings/domain', label: 'Domeniu' },
            { href: '/dashboard/settings/seo', label: 'SEO' },
          ],
        },
        {
          label: 'Operațiuni',
          items: [
            { href: '/dashboard/settings/payments', label: 'Plăți & facturare' },
            { href: '/dashboard/settings/loyalty', label: 'Fidelizare' },
          ],
        },
        {
          label: 'Contabilitate',
          items: [
            { href: '/dashboard/settings/exports', label: 'Export contabilitate' },
            { href: '/dashboard/settings/smartbill', label: 'SmartBill (facturare)' },
            { href: '/dashboard/settings/efactura', label: 'ANAF e-Factura' },
          ],
        },
        {
          label: 'Integrări',
          items: [
            { href: '/dashboard/settings/integrations', label: 'Integrări' },
            { href: '/dashboard/settings/voice', label: 'Canal vocal (Twilio)' },
            { href: '/dashboard/settings/integrations#embed', label: 'Widget pentru site' },
            {
              href: '/dashboard/settings/aggregator-intake',
              label: 'Preluare comenzi (Glovo/Wolt/Bolt)',
            },
            { href: '/dashboard/settings/inventory', label: 'Stocuri (Premium)' },
            // Integration with main from #341 (Master Orchestrator) — AI
            // controls fit cleanly under Integrări since the Orchestrator
            // ledger + per-tenant trust flag is what surfaces here.
            { href: '/dashboard/settings/ai-trust', label: 'Încredere AI' },
          ],
        },
      ],
    },
    { href: '/dashboard/settings/audit', label: 'Jurnal acțiuni', icon: 'sliders' as const },
    { href: '/dashboard/help', label: 'Ajutor', icon: 'helpCircle' as const },
    ...(isPlatformAdmin
      ? [
          {
            href: '/dashboard/admin/tenants',
            label: 'Toate restaurantele',
            icon: 'users' as const,
          },
          {
            href: '/dashboard/admin/onboard',
            label: '+ Tenant nou',
            icon: 'rocket' as const,
          },
          {
            href: '/dashboard/admin/partners',
            label: 'Parteneri',
            icon: 'users' as const,
          },
          {
            href: '/dashboard/admin/fleet-managers',
            label: 'Fleet managers',
            icon: 'users' as const,
          },
          {
            href: '/dashboard/feedback',
            label: 'Feedback vendori',
            icon: 'megaphone' as const,
          },
          {
            href: '/dashboard/admin/system',
            label: 'Sentry · sistem',
            icon: 'settings' as const,
          },
          {
            href: '/dashboard/admin/incidents',
            label: 'Incidente /status',
            icon: 'megaphone' as const,
          },
          {
            href: '/dashboard/admin/observability/materialized-views',
            label: 'Vizualizări materializate',
            icon: 'settings' as const,
          },
          {
            href: '/dashboard/admin/observability/function-runs',
            label: 'Edge Functions',
            icon: 'settings' as const,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-56 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-4">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-600 text-xs font-bold text-white">H</span>
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
              href={storefrontUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Vezi storefront</span>
            </a>
            <span className="hidden md:inline">{user.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
                Logout
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
      <PwaInstallPrompt />
      <FeedbackFab tenantId={tenant.id} />
      <CmdKPalette />
    </div>
  );
}
