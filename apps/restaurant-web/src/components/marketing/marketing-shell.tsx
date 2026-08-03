// Marketing chrome (header + footer) for the HIR brand presentation site.
// Used on the root marketing landing + /cum-functioneaza, /clienti, /contact,
// and shown when no tenant is resolved from host.
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

// 2026-08-01 — the site is repositioned as a "here's how it works" showcase
// rather than a sales funnel (Iulian: "nu incerc sa convertesc din site ...
// doar sa vada cum functioneaza"). /pricing is retired outright (301 to `/`,
// see next.config.mjs) — a subscription pitch doesn't fit that job, and
// real deals close through direct contact, not a self-serve calculator.
// "Clienți" replaces the nav's demo slot; the demo itself stays reachable
// from the hero, the final CTA and the mobile sticky bar. /connect and
// /migrate-from-gloriafood still resolve at their own URLs and keep their
// sitemap entries; they're just not surfaced in the primary nav, same
// treatment /status and /press already get in the footer below.
//
// 2026-08-01 (later same day) — "Funcționalități" (/features, a wall of
// feature cards) became "Cum funcționează?" (/cum-functioneaza, a
// screenshot-led walkthrough) per Iulian; /features 301s there.
const NAV: NavItem[] = [
  { href: '/', labelKey: 'marketing.shell.nav_home' },
  { href: '/cum-functioneaza', labelKey: 'marketing.shell.nav_how' },
  { href: '/clienti', labelKey: 'marketing.shell.nav_clients' },
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
      {/* 2026-08-03 — the "Sari la conținut" skip link is gone, per Iulian
          ("vreau sa dispara"). It was behaving correctly (sr-only until
          focused), but App Router moves focus to the top of the document after
          every client-side navigation, so it flashed into the top-left corner
          on each page change and read as a bug.

          WCAG 2.4.1 (Bypass Blocks) still holds without it: these pages are
          landmarked — <header>, a labelled <nav>, and <main id="main-content">
          — which is technique ARIA11, and the primary nav is four links, so
          there is very little to bypass in the first place. */}
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
        </nav>
        <div className="flex items-center gap-2">
          <LocaleSwitcher
            current={currentLocale}
            ariaLabel={t(currentLocale, 'marketing.shell.locale_switcher_label')}
          />
          {/* 2026-08-03 — the account glyph moved OFF the presentation site and
              into the demo storefront's header, per Iulian ("omuletul ... as
              vrea sa apara in contul restaurantului demo, acolo ma
              intereseaza"). It belongs there: in a storefront it means the
              diner's own account, which is a real thing to show a prospect.
              Here it only ever meant "sign yourself up", and onboarding is
              handled personally ("toate onboardingurile vor fi facute personal
              de mine"), so the button was inviting a journey nobody takes.
              /intra-in-cont is untouched and still reachable from
              /incepe-cu-hir for tenants who already have an account. */}
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
      </nav>
    </header>
    </>
  );
}

// 2026-08-02 — footer cut down to the two things a visitor actually needs
// here: who we are, and the two legal documents. Iulian: "footerul este prea
// incarcat. scoate program reselleri si contact comercial, practic tot ce tine
// de parteneri. tot ce tine de produs. iar la rubrica legal va exista doar
// confidentialitate si termeni si conditii."
//
// Nothing was deleted, only unlinked from here: /cum-functioneaza, /clienti and
// /demo-storefront are all in the primary nav or the homepage CTAs; /orase and
// /parteneriat/inscriere keep their URLs and their sitemap entries; the
// remaining legal documents (cookies, delivery, refund, DPA, sub-processors,
// company details) are reachable from the bottom of /terms and /privacy — see
// LegalShell — which is what "acolo vom avea toate celelalte incluse" asks for.
// The cookie policy is also linked from the consent banner itself, so it stays
// one click away on every page.
export function MarketingFooter({ currentLocale }: { currentLocale: Locale }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[#E2E8F0] bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-md">
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
            title={t(currentLocale, 'marketing.shell.footer_col_legal')}
            links={[
              { href: '/terms', label: t(currentLocale, 'marketing.shell.footer_link_terms') },
              { href: '/privacy', label: t(currentLocale, 'marketing.shell.footer_link_privacy') },
            ]}
          />
        </div>
        {/* NETOPIA logo (required for merchant approval — see NetopiaLogo) +
            ANPC/SAL/SOL links (Ordin ANPC 449/2003 + Reg. UE 524/2013). Both
            stay; 2026-08-02 they were only made smaller and folded into one
            row, per "netopia vreau sa fie vizibil dar mai mic, la fel si
            site-urile anpc". */}
        <NetopiaTrustSignal locale={currentLocale} />
        <div className="mt-6 flex flex-col gap-2 border-t border-[#F1F5F9] pt-6 text-xs text-[#94A3B8] md:flex-row md:items-center md:justify-between">
          {/* Company registration number dropped here 2026-08-02 at Iulian's
              request. It is a Legea 365/2002 art. 5 disclosure, so it still
              appears where it legally has to: on the storefront footer that
              accompanies an actual purchase (components/storefront/hir-footer),
              and on /legal/companie. */}
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0F172A]">
        {title}
      </h2>
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
// 2026-08-02 — same elements, a third of the height. The logo is capped at
// 96px (NTPLogo is `width: 100%` up to a 150px max, so a narrower wrapper
// scales it down cleanly), the four consumer-protection links go back to the
// discreet text row (`variant="light"`) instead of the icon pills, and the
// payment disclosure is one line instead of three.
//
// What must NOT be trimmed further: the NETOPIA logo itself (merchant approval
// was rejected once for its absence) and the "Legislație SAL" link to
// legislatie.just.ro (rejected once for that too).
function NetopiaTrustSignal({ locale }: { locale: Locale }) {
  const title = locale === 'en' ? 'Secure payments' : 'Plăți securizate';
  const intro =
    locale === 'en' ? 'Secure online payments via' : 'Plăți online securizate prin';
  const protection =
    locale === 'en'
      ? '3-D Secure transactions. Card data is never stored by HIR — it is processed exclusively by the authorized PCI DSS payment processor.'
      : 'Tranzacții 3-D Secure. Datele cardului nu sunt stocate de HIR — sunt procesate exclusiv de procesatorul de plăți autorizat, conform PCI DSS.';

  return (
    <section
      aria-label={title}
      className="mt-10 flex flex-col gap-4 border-t border-[#F1F5F9] pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
    >
      <div className="flex items-center gap-3">
        {/* NETOPIA merchant logo (NTPLogo bound to POS secret=165813) */}
        <div className="w-24 flex-none">
          <NetopiaLogo />
        </div>
        <p className="max-w-sm text-[11px] leading-snug text-[#94A3B8]">
          {intro}{' '}
          <a
            href="https://netopia-payments.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#64748B] hover:text-[#0F172A] hover:underline"
          >
            NETOPIA Payments
          </a>
          . {protection}
        </p>
      </div>
      {/* Consumer protection links (ANPC + SAL + Legislație SAL + SOL UE) */}
      <ConsumerBadges variant="light" className="flex-none" />
    </section>
  );
}
