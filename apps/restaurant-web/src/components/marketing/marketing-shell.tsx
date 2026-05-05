// Marketing chrome (header + footer) for the HIR brand presentation site.
// Used on root marketing landing + /features, /pricing, /contact,
// /case-studies/* and shown when no tenant is resolved from host.
//
// Design tokens match /affiliate + /reseller (Inter, indigo-600 primary,
// greyscale background, no shadows on chrome).

import Link from 'next/link';

const NAV: { href: string; label: string }[] = [
  { href: '/', label: 'Acasă' },
  { href: '/features', label: 'Funcționalități' },
  { href: '/pricing', label: 'Tarife' },
  { href: '/migrate-from-gloriafood', label: 'Migrare GloriaFood' },
  { href: '/case-studies/foisorul-a', label: 'Studiu de caz' },
  { href: '/contact', label: 'Contact' },
];

export function MarketingHeader({ active }: { active?: string }) {
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
          HIR Restaurant Suite
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
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/affiliate"
            className="hidden rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] sm:inline-flex"
          >
            Devino partener
          </Link>
          <Link
            href="/migrate-from-gloriafood"
            className="rounded-md bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
          >
            Înscrie restaurantul
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
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export function MarketingFooter() {
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
              HIR Restaurant Suite
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#64748B]">
              Platformă completă pentru restaurante: comenzi online, livrare proprie, CRM,
              loyalty și migrare GloriaFood. Construit în România.
            </p>
          </div>
          <FooterCol
            title="Produs"
            links={[
              { href: '/features', label: 'Funcționalități' },
              { href: '/pricing', label: 'Tarife' },
              { href: '/migrate-from-gloriafood', label: 'Migrare GloriaFood' },
              { href: '/case-studies/foisorul-a', label: 'Studiu de caz' },
              { href: '/status', label: 'Status platformă' },
            ]}
          />
          <FooterCol
            title="Parteneri"
            links={[
              { href: '/affiliate', label: 'Program Afiliați' },
              { href: '/reseller', label: 'Program Reseleri' },
              { href: '/contact', label: 'Contact comercial' },
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              { href: '/privacy', label: 'Confidențialitate' },
              { href: '/terms', label: 'Termeni' },
              { href: '/cookies', label: 'Cookies' },
            ]}
          />
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-[#F1F5F9] pt-6 text-xs text-[#94A3B8] md:flex-row md:items-center md:justify-between">
          <p>
            © {year} HIR &amp; BUILD YOUR DREAMS S.R.L. · CUI RO46864293
          </p>
          <p>
            <a
              href="mailto:contact@hiraisolutions.ro"
              className="hover:text-[#0F172A]"
            >
              contact@hiraisolutions.ro
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
