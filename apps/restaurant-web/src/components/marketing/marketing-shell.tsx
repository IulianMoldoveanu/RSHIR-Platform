// Marketing chrome (header + footer) for the HIR brand presentation site.
// Used on root marketing landing + /features, /pricing, /contact,
// /case-studies/* and shown when no tenant is resolved from host.
//
// Design tokens match /affiliate + /reseller (Inter, indigo-600 primary,
// greyscale background, no shadows on chrome).
//
// Lane EN-I18N (2026-05-05) — accepts `currentLocale` from the calling
// server component (each route reads `getLocale()` and passes it in) so
// nav labels + CTAs + footer copy translate via `t()` with no client
// boundary; the `LocaleSwitcher` pill is the one client-island in the
// chrome and writes the cookie via /api/locale on click.

import Link from 'next/link';
import { LocaleSwitcher } from '@/components/storefront/locale-switcher';
import { t, type Locale, type TKey } from '@/lib/i18n';

type NavItem = { href: string; labelKey: TKey };

const NAV: NavItem[] = [
  { href: '/', labelKey: 'marketing.shell.nav_home' },
  { href: '/features', labelKey: 'marketing.shell.nav_features' },
  { href: '/pricing', labelKey: 'marketing.shell.nav_pricing' },
  { href: '/migrate-from-gloriafood', labelKey: 'marketing.shell.nav_migrate' },
  { href: '/case-studies/foisorul-a', labelKey: 'marketing.shell.nav_case_studies' },
  { href: '/contact', labelKey: 'marketing.shell.nav_contact' },
];

export function MarketingHeader({
  active,
  currentLocale,
}: {
  active?: string;
  currentLocale: Locale;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-[#0F172A]"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#4F46E5] text-xs font-bold text-white">
            H
          </span>
          {t(currentLocale, 'marketing.shell.brand_name')}
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const isActive = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-[#EEF2FF] text-[#4338CA]'
                    : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                {t(currentLocale, item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <LocaleSwitcher
            current={currentLocale}
            ariaLabel={t(currentLocale, 'marketing.shell.locale_switcher_label')}
          />
          <Link
            href="/parteneriat/inscriere"
            className="hidden rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] sm:inline-flex"
          >
            {t(currentLocale, 'marketing.shell.cta_become_partner')}
          </Link>
          <Link
            href="/migrate-from-gloriafood"
            className="rounded-md bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
          >
            {t(currentLocale, 'marketing.shell.cta_signup_restaurant')}
          </Link>
        </div>
      </div>
      {/* Mobile nav: simple horizontal scroll */}
      <nav className="flex gap-1 overflow-x-auto border-t border-[#F1F5F9] px-4 py-2 md:hidden">
        {NAV.map((item) => {
          const isActive = active === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-1 text-xs transition-colors ${
                isActive
                  ? 'bg-[#EEF2FF] text-[#4338CA]'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {t(currentLocale, item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export function MarketingFooter({ currentLocale }: { currentLocale: Locale }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[#E2E8F0] bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[#0F172A]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#4F46E5] text-xs font-bold text-white">
                H
              </span>
              {t(currentLocale, 'marketing.shell.brand_name')}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#64748B]">
              {t(currentLocale, 'marketing.shell.footer_tagline')}
            </p>
          </div>
          <FooterCol
            title={t(currentLocale, 'marketing.shell.footer_col_product')}
            links={[
              { href: '/features', label: t(currentLocale, 'marketing.shell.footer_link_features') },
              { href: '/pricing', label: t(currentLocale, 'marketing.shell.footer_link_pricing') },
              { href: '/migrate-from-gloriafood', label: t(currentLocale, 'marketing.shell.footer_link_migrate') },
              { href: '/case-studies/foisorul-a', label: t(currentLocale, 'marketing.shell.footer_link_case_studies') },
              // Lane STOREFRONT-CITY-LANDING (2026-05-06) — surface the
              // city directory in the product column so SEO crawlers find
              // /orase from every marketing page.
              { href: '/orase', label: t(currentLocale, 'marketing.shell.footer_link_cities') },
              // Lane SITE-COPY-V2 (2026-05-10) — /status hidden from public
              // footer + sitemap until Iulian decides on credibility play.
              // Page still resolves at the URL for admin direct access.
            ]}
          />
          <FooterCol
            title={t(currentLocale, 'marketing.shell.footer_col_partners')}
            links={[
              { href: '/parteneriat/inscriere', label: t(currentLocale, 'marketing.shell.footer_link_reseller') },
              { href: '/contact', label: t(currentLocale, 'marketing.shell.footer_link_contact') },
              // Lane SITE-COPY-V2 (2026-05-10) — /press hidden from public
              // footer + sitemap until brand assets ship. Page still
              // resolves at the URL for direct access.
            ]}
          />
          <FooterCol
            title={t(currentLocale, 'marketing.shell.footer_col_legal')}
            links={[
              { href: '/privacy', label: t(currentLocale, 'marketing.shell.footer_link_privacy') },
              // Lane FOOTER-POLISH-V1 (2026-05-10) — `/terms` route nu există
              // încă; ascundem link-ul din footer până când pagina este
              // publicată. `/cookies` re-pointat la aliasul existent
              // `/politica-cookies` (același conținut), fix 404 din footerul
              // live de pe hirforyou.ro.
              { href: '/politica-cookies', label: t(currentLocale, 'marketing.shell.footer_link_cookies') },
            ]}
          />
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-[#F1F5F9] pt-6 text-xs text-[#94A3B8] md:flex-row md:items-center md:justify-between">
          <p>
            {t(currentLocale, 'marketing.shell.footer_copyright_template', { year })}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href="mailto:office@hirforyou.ro"
              className="hover:text-[#0F172A]"
            >
              office@hirforyou.ro
            </a>
            <span aria-hidden className="text-[#CBD5E1]">·</span>
            <a
              href="tel:+40743700916"
              className="hover:text-[#0F172A]"
            >
              +40 743 700 916
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]">
        {title}
      </h4>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
