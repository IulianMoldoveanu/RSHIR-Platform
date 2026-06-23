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
import { ConsumerBadges } from '@/components/legal/consumer-badges';
import { NetopiaLogo } from '@/components/marketing/netopia-logo';
import { t, type Locale, type TKey } from '@/lib/i18n';

type NavItem = { href: string; labelKey: TKey };

const NAV: NavItem[] = [
  { href: '/', labelKey: 'marketing.shell.nav_home' },
  { href: '/features', labelKey: 'marketing.shell.nav_features' },
  { href: '/pricing', labelKey: 'marketing.shell.nav_pricing' },
  { href: '/connect', labelKey: 'marketing.shell.nav_connect' },
  { href: '/migrate-from-gloriafood', labelKey: 'marketing.shell.nav_migrate' },
  // Case study link hidden 2026-06-02 per Iulian directive (temporar — sa nu fie vizibil).
  // Page itself still resolves at /case-studies/foisorul-a; re-add this NAV entry to restore.
  // { href: '/case-studies/foisorul-a', labelKey: 'marketing.shell.nav_case_studies' },
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
    <>
      {/* Lane MARKETING-POLISH-V4B (2026-05-16) — visible-on-focus skip link
          for keyboard + screen-reader users. Targets `#main-content` on the
          parent <main> of every marketing page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[#4F46E5] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-[#4338CA] focus:ring-offset-2"
      >
        {t(currentLocale, 'marketing.shell.skip_to_content')}
      </a>
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
        <nav
          aria-label={t(currentLocale, 'marketing.shell.primary_nav_label')}
          className="hidden items-center gap-1 md:flex"
        >
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
          {/* Lane HIRforYOU-MARKETPLACE (2026-05-28) — consumer-facing
              discovery links. Hard-coded copy (RO-first) to avoid
              extending the typed NAV dictionary until the surface
              stabilizes. Followup: lift to marketing.shell.nav_*. */}
          <Link
            href="/restaurante"
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active === '/restaurante'
                ? 'bg-[#EEF2FF] text-[#4338CA]'
                : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
            }`}
          >
            {currentLocale === 'en' ? 'Restaurants' : 'Restaurante'}
          </Link>
          <Link
            href="/cont"
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active === '/cont'
                ? 'bg-[#EEF2FF] text-[#4338CA]'
                : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
            }`}
          >
            {currentLocale === 'en' ? 'My account' : 'Contul meu'}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <LocaleSwitcher
            current={currentLocale}
            ariaLabel={t(currentLocale, 'marketing.shell.locale_switcher_label')}
          />
          {/* 2026-06-15 — restored direct Log in link per Iulian directive.
              Previously this CTA pointed to /intra-in-cont (a hub asking
              "login or signup?"), which forced an extra click on returning
              users. Now: Log in is the primary CTA (direct to admin /login),
              Create account is the secondary CTA. /intra-in-cont still exists
              as a fallback hub but is no longer reached from the header. */}
          <a
            href={`${process.env.NEXT_PUBLIC_RESTAURANT_ADMIN_URL ?? 'https://app.hirforyou.ro'}/signup`}
            className="hidden rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] sm:inline-flex"
            rel="noopener"
          >
            {t(currentLocale, 'marketing.shell.cta_signup_restaurant')}
          </a>
          <a
            href={`${process.env.NEXT_PUBLIC_RESTAURANT_ADMIN_URL ?? 'https://app.hirforyou.ro'}/login`}
            className="rounded-md bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            rel="noopener"
          >
            {t(currentLocale, 'marketing.shell.cta_login')}
          </a>
        </div>
      </div>
      {/* Mobile nav: simple horizontal scroll */}
      <nav
        aria-label={t(currentLocale, 'marketing.shell.primary_nav_label')}
        className="flex gap-1 overflow-x-auto border-t border-[#F1F5F9] px-4 py-2 md:hidden"
      >
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
        <Link
          href="/restaurante"
          className={`whitespace-nowrap rounded-md px-3 py-1 text-xs transition-colors ${
            active === '/restaurante'
              ? 'bg-[#EEF2FF] text-[#4338CA]'
              : 'text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          {currentLocale === 'en' ? 'Restaurants' : 'Restaurante'}
        </Link>
        <Link
          href="/cont"
          className={`whitespace-nowrap rounded-md px-3 py-1 text-xs transition-colors ${
            active === '/cont'
              ? 'bg-[#EEF2FF] text-[#4338CA]'
              : 'text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          {currentLocale === 'en' ? 'My account' : 'Contul meu'}
        </Link>
      </nav>
    </header>
    </>
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
              { href: '/connect', label: t(currentLocale, 'marketing.shell.footer_link_connect') },
              { href: '/migrate-from-gloriafood', label: t(currentLocale, 'marketing.shell.footer_link_migrate') },
              // Case study link hidden 2026-06-02 per Iulian directive (temporar). Re-add to restore.
              // { href: '/case-studies/foisorul-a', label: t(currentLocale, 'marketing.shell.footer_link_case_studies') },
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
            // 2026-06-10 — Legal column simplified per Iulian directive
            // ("la legal sunt mult prea multe linkuri. fa doar cateva pagini
            // cu subpagini, este extrem de alambicat și fără rost, arată urat").
            // Reduced from 11 links to 3 essentials + hub link to /legal where
            // all subpages are organized by category (Essentials / Orders &
            // delivery / For partners & operators). All sub-pages still live
            // at their existing URLs — only footer surface was the problem.
            title={t(currentLocale, 'marketing.shell.footer_col_legal')}
            links={[
              { href: '/terms', label: t(currentLocale, 'marketing.shell.footer_link_terms') },
              { href: '/privacy', label: t(currentLocale, 'marketing.shell.footer_link_privacy') },
              { href: '/politica-cookies', label: t(currentLocale, 'marketing.shell.footer_link_cookies') },
              { href: '/legal', label: currentLocale === 'en' ? 'All legal documents →' : 'Toate documentele legale →' },
            ]}
          />
        </div>
        {/* 2026-06-10 — Combined trust block: NETOPIA logo (PSP requirement) +
            ANPC/SAL/SOL badges (consumer protection — RO/UE). Iulian explicit
            request după Netopia rejection round 1: ANPC vizibil LÂNGĂ Netopia
            în footer. Inline text version of ConsumerBadges removed to avoid
            duplication — single badges row now serves both legal compliance
            (Ordin ANPC 449/2003 + Reg. UE 524/2013) AND visibility. */}
        <NetopiaTrustSignal locale={currentLocale} />
        <div className="mt-6 flex flex-col gap-2 border-t border-[#F1F5F9] pt-6 text-xs text-[#94A3B8] md:flex-row md:items-center md:justify-between">
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

// Netopia approval trust signal — afișat ca bloc separat sub badge-urile
// consumator, peste copyright. Textul RO/EN este hardcodat aici (nu prin
// dictionar i18n) ca să fie revizuibil împreună cu politicile de plată.
// Sigla oficială NETOPIA (component NTPLogo legat de POS HIRforYOU Production
// secret=165813) e renderată via NetopiaLogo client component — Netopia a
// respins prima cerere cu motivul "sigla este element obligatoriu" (2026-06-10),
// deci NU înlocui acel <NetopiaLogo /> cu text până la confirmare aprobare.
function NetopiaTrustSignal({ locale }: { locale: Locale }) {
  const title =
    locale === 'en' ? 'Secure payments' : 'Plăți securizate';
  const intro =
    locale === 'en'
      ? 'Secure online payments via'
      : 'Plăți online securizate prin';
  const protection =
    locale === 'en'
      ? 'Transactions protected by 3-D Secure. Card data is not stored by HIR — it is processed exclusively by the authorized payment processor, in compliance with PCI DSS.'
      : 'Tranzacții protejate prin protocolul 3-D Secure. Datele cardului nu sunt stocate de HIR — sunt procesate exclusiv de procesatorul de plăți autorizat, conform standardului PCI DSS.';

  const protectionTitle =
    locale === 'en' ? 'Consumer protection' : 'Protecția consumatorilor';

  return (
    <section
      aria-label={title}
      className="mt-10 border-t border-[#F1F5F9] pt-6 text-xs leading-relaxed text-[#64748B]"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]">
        {title}
      </h4>
      <p className="mt-2 max-w-3xl">
        {intro}{' '}
        <a
          href="https://netopia-payments.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#0F172A] hover:underline"
        >
          NETOPIA Payments
        </a>
        . {protection}
      </p>
      <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        {/* NETOPIA merchant logo (NTPLogo bound to POS secret=165813) */}
        <div className="flex-none">
          <NetopiaLogo />
        </div>
        {/* Consumer protection badges (ANPC + SAL + Legislație + SOL UE) */}
        <div className="flex-1">
          <h5 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
            {protectionTitle}
          </h5>
          <ConsumerBadges variant="badges" />
        </div>
      </div>
    </section>
  );
}
