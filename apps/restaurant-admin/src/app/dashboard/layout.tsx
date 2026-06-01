import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { computeOnboardingState } from '@/lib/onboarding';
import { getActiveTenant } from '@/lib/tenant';
import { getTenantDeliveryMode, isHeadless } from '@/lib/tenant-mode';
import { hasMultipleLocations } from '@/lib/brand';
import { tenantStorefrontUrl } from '@/lib/storefront-url';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { logoutAction } from './actions';
import { TenantSelector } from './tenant-selector';
import { SidebarNav, type SidebarEntry } from './sidebar-nav';
import { MobileSidebar } from './mobile-sidebar';
import { PwaInstallPrompt } from '@/components/pwa-install-prompt';
import { FeedbackFab } from '@/components/feedback-fab';
import { CmdKPalette } from '@/components/cmd-k';
import { NotificationPermissionButton } from '@/components/notification-permission-button';

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
  const { user, tenant, tenants, isPlatformAdminMode } = active;

  const deliveryMode = isPlatformAdminMode
    ? 'full_saas' as const
    : await getTenantDeliveryMode(tenant.id);
  const connectMode = isHeadless(deliveryMode);
  const isBrandMultiLocation = isPlatformAdminMode
    ? false
    : await hasMultipleLocations(tenant.id);

  let onboarding: Awaited<ReturnType<typeof computeOnboardingState>>;
  if (isPlatformAdminMode) {
    onboarding = { menu_added: false, hours_set: false, zones_set: false, went_live: true, completed_at: null };
  } else {
    try {
      onboarding = await computeOnboardingState(tenant.id);
    } catch (err) {
      console.error('[dashboard/layout] onboarding probe failed:', (err as Error).message);
      onboarding = { menu_added: false, hours_set: false, zones_set: false, went_live: false, completed_at: null };
    }
  }
  const storefrontUrl = isPlatformAdminMode ? null : tenantStorefrontUrl(tenant.slug);

  const isPlatformAdmin = isPlatformAdminEmail(user.email);

  // Headless (HIR Connect) nav: hide storefront-facing features, expose
  // only the service-layer surfaces (orders, courier, AI, analytics, API).
  const connectNavEntries: SidebarEntry[] = [
    { href: '/dashboard', label: 'Acasă', icon: 'layoutDashboard' as const },
    { href: '/dashboard/orders', label: 'Comenzi', icon: 'receipt' as const },
    { href: '/dashboard/orders/manual-entry', label: 'Comandă manuală' },
    // Menu is read-only for Connect tenants — they manage their own site.
    { href: '/dashboard/menu', label: 'Meniu (citire)', icon: 'bookOpen' as const },
    { href: '/dashboard/ai-ceo', label: 'AI CEO', icon: 'sparkles' as const },
    { href: '/dashboard/ai-activity', label: 'Jurnal AI' },
    {
      label: 'Operațiuni',
      icon: 'sliders' as const,
      items: [
        { href: '/dashboard/operations/live-orders', label: 'Livrări live' },
        { href: '/dashboard/zones', label: 'Zone livrare' },
        { href: '/dashboard/settings/operations', label: 'Program & pickup' },
        { href: '/dashboard/settings/notifications', label: 'Notificări' },
        { href: '/dashboard/pre-orders', label: 'Pre-comenzi' },
        { href: '/dashboard/voice', label: 'Apeluri vocale' },
        { href: '/dashboard/inventory', label: 'Stocuri' },
        { href: '/kds', label: 'Ecran bucătărie (KDS)' },
      ],
    },
    {
      label: 'Analytics',
      icon: 'megaphone' as const,
      items: [
        { href: '/dashboard/analytics', label: 'Analytics' },
        { href: '/dashboard/customer-insights', label: 'Insights clienți' },
      ],
    },
    {
      label: 'API & Integrări',
      icon: 'settings' as const,
      items: [
        { href: '/dashboard/settings/integrations/api', label: 'API Settings' },
        // Webhook config route — filled by connect-webhook PR (Task 2).
        { href: '/dashboard/settings/integrations/webhooks', label: 'Webhook configurare' },
        { href: '/dashboard/settings/integrations', label: 'Integrări' },
        { href: '/dashboard/settings/aggregator-intake', label: 'Preluare comenzi (Glovo/Wolt/Bolt)' },
        { href: '/dashboard/settings/ai-trust', label: 'Încredere AI' },
      ],
    },
    { href: '/dashboard/settings/audit', label: 'Jurnal acțiuni', icon: 'sliders' as const },
    { href: '/dashboard/help', label: 'Ajutor', icon: 'helpCircle' as const },
  ];

  // Tenant-scoped nav (Comenzi / Meniu / Marketing / etc). Hidden in
  // platform-admin-only mode so Iulian doesn't see a fake "Foișorul A"
  // shell when he hasn't been onboarded as a member of any restaurant.
  const tenantNavEntries: SidebarEntry[] = isPlatformAdminMode ? [] : connectMode ? connectNavEntries : [
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
    ...(isBrandMultiLocation
      ? [
          {
            href: '/dashboard/brand',
            label: 'Brand (multi-locație)',
            icon: 'layoutDashboard' as const,
          },
        ]
      : []),
    { href: '/dashboard/orders', label: 'Comenzi', icon: 'receipt' as const },
    { href: '/dashboard/orders/manual-entry', label: 'Comandă manuală' },
    { href: '/dashboard/orders/aggregator-inbox', label: 'Inbox preluare email' },
    { href: '/dashboard/menu', label: 'Meniu', icon: 'bookOpen' as const },
    {
      label: 'Marketing',
      icon: 'megaphone' as const,
      items: [
        { href: '/dashboard/promos', label: 'Coduri reducere' },
        { href: '/dashboard/marketing/newsletter', label: 'Newsletter' },
        { href: '/dashboard/reviews', label: 'Recenzii' },
        { href: '/dashboard/customer-insights', label: 'Insights clienți' },
        { href: '/dashboard/customers/reactivation', label: 'Reactivare clienți' },
        { href: '/dashboard/analytics', label: 'Analytics' },
        { href: '/dashboard/champion', label: 'Recomandă & câștigă' },
      ],
    },
    { href: '/dashboard/ai-ceo', label: 'AI CEO', icon: 'sparkles' as const },
    { href: '/dashboard/ai-activity', label: 'Jurnal AI' },
    {
      label: 'Operațiuni',
      icon: 'sliders' as const,
      items: [
        { href: '/dashboard/operations/live-orders', label: 'Livrări live' },
        { href: '/dashboard/zones', label: 'Zone livrare' },
        { href: '/dashboard/settings/operations', label: 'Program & pickup' },
        { href: '/dashboard/settings/notifications', label: 'Notificări' },
        { href: '/dashboard/reservations', label: 'Rezervări' },
        { href: '/dashboard/pre-orders', label: 'Pre-comenzi' },
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
  ];

  // HIR Command Center — the single platform control modality. One grouped nav
  // so every operation (orders, verifications, fleets, vendors, cities) is one
  // click away, across all verticals.
  const adminNavEntries: SidebarEntry[] = isPlatformAdmin
    ? [
        { href: '/dashboard/admin/hub', label: 'Command Center', icon: 'layoutDashboard' as const },
        {
          label: 'Operare',
          icon: 'receipt' as const,
          items: [
            { href: '/dashboard/admin/orders', label: 'Comenzi (toate verticalele)' },
            { href: '/dashboard/admin/control-room', label: 'Control Room (live)' },
            { href: '/dashboard/admin/verifications', label: 'Verificări (KYC/KYF)' },
            { href: '/dashboard/admin/fleets', label: 'Flote — control' },
            { href: '/dashboard/admin/fleet-allocation', label: 'Alocare flote' },
            { href: '/dashboard/admin/fleet-managers', label: 'Fleet managers' },
          ],
        },
        {
          label: 'Vendori & orașe',
          icon: 'users' as const,
          items: [
            { href: '/dashboard/admin/tenants', label: 'Toți vendorii' },
            { href: '/dashboard/admin/cities/events', label: 'Orașe' },
            { href: '/dashboard/admin/onboard', label: '+ Tenant nou' },
            { href: '/dashboard/admin/onboard/connect', label: '+ HIR Connect' },
            { href: '/dashboard/admin/onboard/sibling', label: '+ Locație (brand existent)' },
          ],
        },
        {
          label: 'Creștere',
          icon: 'megaphone' as const,
          items: [
            { href: '/dashboard/admin/partners', label: 'Parteneri' },
            { href: '/dashboard/admin/affiliates', label: 'Aplicații reseller' },
            { href: '/dashboard/feedback', label: 'Feedback vendori' },
          ],
        },
        {
          label: 'Sistem',
          icon: 'settings' as const,
          items: [
            { href: '/dashboard/admin/system', label: 'Sentry · sistem' },
            { href: '/dashboard/admin/incidents', label: 'Incidente /status' },
            { href: '/dashboard/admin/observability/materialized-views', label: 'Vizualizări materializate' },
            { href: '/dashboard/admin/observability/function-runs', label: 'Edge Functions' },
            { href: '/dashboard/admin/intents', label: 'Intent registry' },
          ],
        },
      ]
    : [];

  const navEntries: SidebarEntry[] = [...tenantNavEntries, ...adminNavEntries];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-56 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-4">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-600 text-xs font-bold text-white">H</span>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">
            HIR
            {connectMode ? (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                Connect
              </span>
            ) : null}
          </span>
        </div>
        <SidebarNav entries={navEntries} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MobileSidebar entries={navEntries} />
            {isPlatformAdminMode ? (
              <span className="inline-flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500" aria-hidden />
                Platformă HIR · admin
              </span>
            ) : (
              <TenantSelector tenants={tenants} activeTenantId={tenant.id} />
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <NotificationPermissionButton />
            {storefrontUrl && !connectMode ? (
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Vezi storefront</span>
              </a>
            ) : null}
            <span className="hidden md:inline">{user.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
                Logout
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">
          {connectMode ? (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
              <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">C</span>
              <p className="text-sm text-indigo-800">
                <span className="font-semibold">Mod HIR Connect</span> — site-ul tău rămâne sursa principală; HIR gestionează doar livrarea + insights AI
              </p>
            </div>
          ) : null}
          {children}
        </main>
      </div>
      <PwaInstallPrompt />
      {isPlatformAdminMode ? null : <FeedbackFab tenantId={tenant.id} />}
      <CmdKPalette />
    </div>
  );
}
