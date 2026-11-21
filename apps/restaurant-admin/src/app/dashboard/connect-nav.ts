import type { SidebarEntry } from './sidebar-nav';

// Connect tenants sell on their own site. Everything that exists to run a
// HIR storefront — menu editing, branding, the storefront link — either
// does nothing for them or actively misleads. This list used to be flat
// with ~24 entries; it now follows the same two-tier shape as the
// full_saas nav in layout.tsx (2026-07-27 directive): what a Connect vendor
// touches daily stays open, the rest is one collapse away. Nothing is
// removed and no roles are introduced — every URL stays reachable.
export const connectNavEntries: SidebarEntry[] = [
  // ── ESENȚIAL ───────────────────────────────────────────────
  { href: '/dashboard', label: 'Acasă', icon: 'layoutDashboard' as const },
  { href: '/dashboard/orders', label: 'Comenzi', icon: 'receipt' as const },
  { href: '/dashboard/operations/live-orders', label: 'Livrări live', icon: 'sliders' as const },
  { href: '/dashboard/analytics', label: 'Rapoarte', icon: 'megaphone' as const },
  {
    href: '/dashboard/settings/operations',
    label: 'Program & punct de ridicare',
    icon: 'settings' as const,
  },
  // ── INTEGRAREA (al doilea lucru pentru care ne-au ales) ─────
  {
    label: 'Integrarea cu site-ul',
    icon: 'settings' as const,
    items: [
      { href: '/dashboard/settings/integrations/api', label: 'Chei API' },
      { href: '/dashboard/settings/integrations/webhooks', label: 'Webhook-uri' },
      { href: '/dashboard/settings/integrations', label: 'Integrări' },
      { href: '/dashboard/settings/aggregator-intake', label: 'Preluare Glovo/Wolt/Bolt' },
    ],
  },
  // ── AVANSAT (tot restul, la o apăsare distanță) ─────────────
  {
    label: 'Avansat',
    icon: 'sliders' as const,
    items: [
      { href: '/dashboard/orders/manual-entry', label: 'Comandă manuală' },
      { href: '/dashboard/customer-insights', label: 'Insights clienți' },
      { href: '/dashboard/zones', label: 'Zone livrare' },
      { href: '/dashboard/settings/notifications', label: 'Notificări' },
      { href: '/dashboard/pre-orders', label: 'Pre-comenzi' },
      { href: '/dashboard/inventory', label: 'Stocuri' },
      { href: '/kds', label: 'Ecran bucătărie (KDS)' },
      { href: '/dashboard/voice', label: 'Apeluri vocale' },
      // Read-only: a Connect vendor's catalogue lives on their own site,
      // and their order lines are free text, so this will usually be empty.
      { href: '/dashboard/menu', label: 'Meniu (citire)' },
      { href: '/dashboard/ai-ceo', label: 'AI CEO' },
      { href: '/dashboard/ai-activity', label: 'Jurnal AI' },
      { href: '/dashboard/settings/ai-trust', label: 'Încredere AI' },
      { href: '/dashboard/settings/audit', label: 'Jurnal acțiuni' },
    ],
  },
  { href: '/dashboard/help', label: 'Ajutor', icon: 'helpCircle' as const },
];
