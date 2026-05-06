// Lane SETTINGS-LANDING (2026-05-06) — replaces 7-line stub with a card grid.
// Mobile sidebar collapses to a hamburger; previously tapping "Configurare"
// → "Setări" landed users on a near-empty screen. Now shows a one-glance
// overview of every settings sub-page with quick status pills.
//
// Server component: one parallel fetch for tenant settings + domain +
// loyalty enabled flag. No new schema, no new tables.

import Link from 'next/link';
import {
  Building2,
  ClipboardList,
  CreditCard,
  Globe,
  Image as ImageIcon,
  Palette,
  Plug,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Users as UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { getCurrentTenantDomain } from '@/app/api/domains/shared';
import { getLoyaltySettings } from '@/lib/loyalty';

export const dynamic = 'force-dynamic';

type CardStatus = {
  label: string;
  tone: 'ok' | 'warn' | 'muted';
};

type SettingCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  status?: CardStatus;
};

const TONE_CLASSES: Record<CardStatus['tone'], string> = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  muted: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

export default async function SettingsLandingPage() {
  const { tenant } = await getActiveTenant();

  // Fetch every status-pill input in parallel — keeps TTFB tight.
  // Lane THEMES (2026-05-06): also fetch template_slug so the new
  // "Temă vizuală" card can show the active vertical template.
  const admin = createAdminClient();
  const [tenantRow, domainInfo, loyalty] = await Promise.all([
    (admin.from('tenants') as unknown as {
      select: (s: string) => {
        eq: (col: string, v: string) => {
          maybeSingle: () => Promise<{
            data: { settings: Record<string, unknown> | null; template_slug: string | null } | null;
          }>;
        };
      };
    })
      .select('settings, template_slug')
      .eq('id', tenant.id)
      .maybeSingle(),
    getCurrentTenantDomain(tenant.id),
    getLoyaltySettings(tenant.id),
  ]);

  const settings = (tenantRow.data?.settings as Record<string, unknown> | null) ?? {};
  const branding = (settings.branding as Record<string, unknown> | undefined) ?? {};
  const hasLogo = typeof branding.logo_url === 'string' && branding.logo_url.length > 0;
  const templateSlug = tenantRow.data?.template_slug ?? null;
  // Display labels for the 5 templates — kept inline (4 entries, no need
  // for a shared lookup table). Romanian formal copy.
  const TEMPLATE_LABEL: Record<string, string> = {
    italian: 'Italian',
    asian: 'Asian',
    'fine-dining': 'Fine Dining',
    bistro: 'Bistro',
    'romanian-traditional': 'Tradițional românesc',
  };

  const domainLabel = domainInfo.domain
    ? domainInfo.status === 'ACTIVE'
      ? domainInfo.domain
      : `${domainInfo.domain} (în verificare)`
    : 'Domeniu implicit';

  const cards: SettingCard[] = [
    {
      href: '/dashboard/settings/branding',
      title: 'Identitate vizuală',
      description: 'Logo, copertă și culoarea de brand pentru storefront.',
      icon: ImageIcon,
      status: hasLogo
        ? { label: 'Logo definit', tone: 'ok' }
        : { label: 'Logo lipsește', tone: 'warn' },
    },
    {
      href: '/dashboard/settings/branding/template',
      title: 'Temă vizuală',
      description: 'Paletă de culori și fonturi predefinite pentru tipul de restaurant.',
      icon: Palette,
      status: templateSlug
        ? { label: TEMPLATE_LABEL[templateSlug] ?? 'Temă activă', tone: 'ok' }
        : { label: 'Implicit', tone: 'muted' },
    },
    {
      href: '/dashboard/settings/domain',
      title: 'Domeniu',
      description: 'Atașați un domeniu propriu sau folosiți subdomeniul implicit.',
      icon: Globe,
      status: {
        label: domainLabel,
        tone: domainInfo.status === 'ACTIVE' ? 'ok' : domainInfo.domain ? 'warn' : 'muted',
      },
    },
    {
      href: '/dashboard/settings/seo',
      title: 'SEO',
      description: 'Titlu, descriere și imagine pentru rezultatele Google.',
      icon: Search,
    },
    {
      href: '/dashboard/settings/loyalty',
      title: 'Fidelizare',
      description: 'Puncte de loialitate și recompense pentru clienți recurenți.',
      icon: Sparkles,
      status: loyalty?.is_enabled
        ? { label: 'Activ', tone: 'ok' }
        : { label: 'Inactiv', tone: 'muted' },
    },
    {
      href: '/dashboard/settings/payments',
      title: 'Plăți și facturare',
      description: 'Conectați Stripe, configurați TVA și datele de facturare.',
      icon: CreditCard,
    },
    {
      href: '/dashboard/settings/integrations',
      title: 'Integrări',
      description: 'POS extern, chei API și widget pentru site-ul propriu.',
      icon: Plug,
    },
    {
      href: '/dashboard/settings/notifications',
      title: 'Notificări',
      description: 'Email și push pentru comenzi, rezervări și raportul zilnic.',
      icon: SettingsIcon,
    },
    {
      href: '/dashboard/settings/operations',
      title: 'Program și pickup',
      description: 'Orar, ridicare la sediu și opțiuni de livrare.',
      icon: Building2,
    },
    {
      href: '/dashboard/settings/team',
      title: 'Echipă',
      description: 'Invitați colegi și gestionați rolurile (OWNER / STAFF).',
      icon: UsersIcon,
    },
    {
      href: '/dashboard/settings/audit',
      title: 'Jurnal acțiuni',
      description: 'Istoricul modificărilor făcute în panou de către echipă.',
      icon: ClipboardList,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Setări</h1>
        <p className="text-sm text-zinc-600">
          Configurați tot ce ține de {tenant.name} dintr-un singur loc.
        </p>
      </header>

      <ul
        role="list"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <li key={card.href}>
              <Link
                href={card.href}
                className="group flex h-full flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-purple-300 hover:bg-zinc-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-100">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  {card.status ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE_CLASSES[card.status.tone]}`}
                    >
                      {card.status.label}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-zinc-900 group-hover:text-purple-700">
                    {card.title}
                  </span>
                  <span className="text-xs text-zinc-600">{card.description}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
