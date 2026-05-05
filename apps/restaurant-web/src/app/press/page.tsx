import type { Metadata } from 'next';
import { Mail, Download, ExternalLink } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';
import { marketingOgImageUrl } from '@/lib/seo-marketing';

// Press kit page. Public, indexable, no auth. Bilingual RO + EN sections
// (journalists scan both locales). Brand tokens match marketing-shell:
// indigo #4F46E5 primary, lavender #EEF2FF accent, slate text.
//
// Logos / screenshots are inline SVG placeholders — no binary assets in
// the repo. When real brand assets ship, drop them under
// /apps/restaurant-web/public/press/ and replace the inline <BrandLogo />
// + <ScreenshotPlaceholder /> components with <Image> tags.

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 86400;

const LAST_UPDATED = '2026-05-05';

// Absolute canonical URL — relative `/press` would require `metadataBase`
// in the root layout, which this app does not set. Match the pattern used
// by /case-studies/foisorul-a and the rest of the marketing routes.
const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const CANONICAL_BASE = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}`
  : 'https://hir-restaurant-web.vercel.app';
const PRESS_URL = `${CANONICAL_BASE}/press`;

const OG_IMAGE = marketingOgImageUrl({
  title: 'HIR Press Kit',
  subtitle: 'Logo, culori, screenshot-uri și fapte despre HIR Restaurant Suite.',
});

export const metadata: Metadata = {
  title: 'Press Kit — HIR Restaurant Suite',
  description:
    'Materiale presă HIR Restaurant Suite: logo, culori brand, screenshot-uri produs, fapte despre companie și contact.',
  openGraph: {
    title: 'Press Kit — HIR Restaurant Suite',
    description:
      'Materiale presă HIR Restaurant Suite: logo, culori brand, screenshot-uri și contact.',
    type: 'website',
    locale: 'ro_RO',
    url: PRESS_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'HIR Press Kit' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Press Kit — HIR Restaurant Suite',
    description:
      'Materiale presă HIR Restaurant Suite: logo, culori, screenshot-uri și contact.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
  // Lane EN-I18N PR D — same URL serves both locales (cookie-based).
  alternates: {
    canonical: PRESS_URL,
    languages: { 'ro-RO': PRESS_URL, en: PRESS_URL, 'x-default': PRESS_URL },
  },
};

const BRAND_COLORS = [
  { name: 'Indigo', hex: '#4F46E5', role: 'Primary', text: '#FFFFFF' },
  { name: 'Indigo Deep', hex: '#4338CA', role: 'Hover / accent', text: '#FFFFFF' },
  { name: 'Lavender', hex: '#EEF2FF', role: 'Surface accent', text: '#4338CA' },
  { name: 'Slate Ink', hex: '#0F172A', role: 'Body text', text: '#FFFFFF' },
  { name: 'Slate', hex: '#475569', role: 'Secondary text', text: '#FFFFFF' },
  { name: 'Slate Line', hex: '#E2E8F0', role: 'Borders', text: '#0F172A' },
];

export default function PressPage() {
  const currentLocale = getLocale();
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader currentLocale={currentLocale} />

      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            Press Kit
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            HIR Press Kit
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            Materiale oficiale pentru jurnaliști, parteneri media și creatori de
            conținut. Logo, culori brand, screenshot-uri produs și fapte despre
            companie. Toate materialele sunt libere pentru utilizare editorială
            cu menționarea sursei.
          </p>
          <p className="mt-3 text-xs text-[#94A3B8]">
            Ultima actualizare: {LAST_UPDATED}
          </p>
        </div>
      </section>

      {/* About */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#4F46E5]">
              Despre HIR (RO)
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[#0F172A]">
              <strong>HIR Restaurant Suite</strong> este platforma all-in-one
              pentru restaurante din România: storefront pentru clienți, panou
              de administrare, aplicație de curier și rețea de livrare —
              construite să înlocuiască Wolt, Glovo, Tazz și GloriaFood la un
              cost previzibil de <strong>3 RON pe livrare</strong>, fără
              comisioane procentuale. Lansat în Brașov, scalează la nivel
              național printr-o rețea de afiliați și manageri de flotă.
            </p>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#4F46E5]">
              About HIR (EN)
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[#0F172A]">
              <strong>HIR Restaurant Suite</strong> is the all-in-one platform
              for Romanian restaurants: customer storefront, admin dashboard,
              courier app and delivery network — built to replace Wolt, Glovo,
              Tazz and GloriaFood at a flat{' '}
              <strong>3 RON per delivery</strong> cost, with no percentage
              commission. Launched in Brașov, scaling nationally through an
              affiliate and fleet-manager network.
            </p>
          </div>
        </div>

        {/* Quick facts */}
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FactCard label="Fondator" value="Iulian Moldoveanu" />
          <FactCard label="Sediu" value="Brașov, România" />
          <FactCard label="Lansare pilot" value="2026" />
          <FactCard label="Tarif livrare" value="3 RON / comandă" />
        </div>
      </section>

      {/* Logos */}
      <section className="border-y border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            Logo
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#475569]">
            Foloseste varianta cu cel mai bun contrast pe fundalul tău. Nu
            modifica proporțiile, nu adăuga umbre, nu schimba culorile. Spațiu
            liber minim în jurul logo-ului: înălțimea literei „H”.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <LogoTile variant="light" label="Pe fundal alb" filename="hir-logo-light" />
            <LogoTile variant="dark" label="Pe fundal închis" filename="hir-logo-dark" />
            <LogoTile variant="wordmark" label="Wordmark" filename="hir-logo-wordmark" />
          </div>
        </div>
      </section>

      {/* Brand colors */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
          Culori brand
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-[#475569]">
          Paleta este sobră, optimizată pentru lizibilitate WCAG AA. Indigo este
          culoarea primară de acțiune; tot restul este greyscale neutru.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BRAND_COLORS.map((c) => (
            <div
              key={c.hex}
              className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white"
            >
              <div
                className="flex h-24 items-end px-4 pb-3 text-xs font-mono"
                style={{ backgroundColor: c.hex, color: c.text }}
              >
                {c.hex}
              </div>
              <div className="px-4 py-3">
                <div className="text-sm font-semibold text-[#0F172A]">
                  {c.name}
                </div>
                <div className="text-xs text-[#475569]">{c.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Screenshots */}
      <section className="border-y border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            Screenshot-uri produs
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#475569]">
            Capturi reprezentative din suita HIR. Pentru rezoluții mai mari sau
            screenshot-uri specifice, scrie-ne la{' '}
            <a
              href="mailto:contact@hiraisolutions.ro"
              className="font-medium text-[#4F46E5] hover:text-[#4338CA]"
            >
              contact@hiraisolutions.ro
            </a>
            .
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <ScreenshotPlaceholder
              label="Storefront client"
              caption="Pagina de comandă a restaurantului — meniu, coș, checkout."
              accent="#4F46E5"
            />
            <ScreenshotPlaceholder
              label="Panou administrare"
              caption="Dashboard restaurant — comenzi live, KPI, rezervări."
              accent="#4338CA"
            />
            <ScreenshotPlaceholder
              label="Aplicație curier"
              caption="Hartă, comenzi active, câștiguri zilnice."
              accent="#7C3AED"
            />
            <ScreenshotPlaceholder
              label="Fleet Manager"
              caption="Coordonare livrări multi-curier pentru flotele afiliate."
              accent="#0F172A"
            />
          </div>
        </div>
      </section>

      {/* Founder */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
          Fondator
        </h2>
        <div className="mt-6 flex flex-col gap-6 rounded-lg border border-[#E2E8F0] bg-white p-6 sm:flex-row sm:p-8">
          <div className="flex-none">
            <div
              aria-hidden
              className="flex h-24 w-24 items-center justify-center rounded-full bg-[#4F46E5] text-3xl font-semibold text-white"
            >
              IM
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[#0F172A]">
              Iulian Moldoveanu
            </h3>
            <p className="text-sm text-[#475569]">Fondator HIR</p>
            <p className="mt-3 text-sm leading-relaxed text-[#0F172A]">
              Iulian a fondat HIR în Brașov pentru a oferi restaurantelor
              independente o alternativă reală la marketplace-urile cu comision
              procentual. Cu experiență directă în logistică și operații
              restaurant, construiește platforma împreună cu o rețea de
              manageri de flotă și proprietari de restaurante care devin
              parteneri și afiliați.
            </p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="border-t border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            Contact presă
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#475569]">
            Pentru interviuri, declarații, materiale suplimentare sau acces la
            piloți live — răspundem în 24 de ore lucrătoare.
          </p>
          <ul className="mt-7 space-y-4 text-sm">
            <li>
              <a
                href="mailto:contact@hiraisolutions.ro?subject=Solicitare%20pres%C4%83%20HIR"
                className="inline-flex items-center gap-3 rounded-md border border-[#E2E8F0] bg-white px-4 py-3 transition-colors hover:bg-[#F8FAFC]"
              >
                <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
                  <Mail className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
                    Email principal
                  </span>
                  <span className="block text-sm font-medium text-[#0F172A]">
                    contact@hiraisolutions.ro
                  </span>
                </span>
              </a>
            </li>
            <li>
              <a
                href="mailto:iulianm698@gmail.com?subject=Solicitare%20pres%C4%83%20HIR"
                className="inline-flex items-center gap-3 rounded-md border border-[#E2E8F0] bg-white px-4 py-3 transition-colors hover:bg-[#F8FAFC]"
              >
                <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
                  <Mail className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
                    Contact direct fondator
                  </span>
                  <span className="block text-sm font-medium text-[#0F172A]">
                    iulianm698@gmail.com
                  </span>
                </span>
              </a>
            </li>
          </ul>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href="/case-studies/foisorul-a"
              className="inline-flex items-center gap-1 rounded-md bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              Studiu de caz: Foișorul A
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <a
              href="/features"
              className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              Funcționalități produs
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-[#0F172A]">{value}</div>
    </div>
  );
}

// Inline SVG logo. Variants:
// - light: indigo glyph + slate wordmark on white/transparent
// - dark:  white glyph + white wordmark on indigo background
// - wordmark: text only, slate ink
// "Download" links are anchors that wrap the inline SVG into a data: URL
// so journalists can save without binary assets in the repo.
function LogoTile({
  variant,
  label,
  filename,
}: {
  variant: 'light' | 'dark' | 'wordmark';
  label: string;
  filename: string;
}) {
  const svg = renderLogoSvg(variant);
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const tileBg =
    variant === 'dark'
      ? 'bg-[#0F172A]'
      : variant === 'wordmark'
        ? 'bg-[#FAFAFA]'
        : 'bg-white';
  const border =
    variant === 'dark' ? 'border-[#0F172A]' : 'border-[#E2E8F0]';

  return (
    <div
      className={`overflow-hidden rounded-lg border ${border} ${tileBg}`}
    >
      <div className="flex h-32 items-center justify-center px-4">
        <div
          aria-hidden
          dangerouslySetInnerHTML={{ __html: svg }}
          className="max-h-20"
        />
      </div>
      <div className="border-t border-[#E2E8F0] bg-white px-4 py-3">
        <div className="text-sm font-semibold text-[#0F172A]">{label}</div>
        <a
          href={dataUrl}
          download={`${filename}.svg`}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#4F46E5] hover:text-[#4338CA]"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Descarcă SVG
        </a>
      </div>
    </div>
  );
}

function renderLogoSvg(variant: 'light' | 'dark' | 'wordmark'): string {
  if (variant === 'wordmark') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 64" width="240" height="48" role="img" aria-label="HIR"><text x="0" y="46" font-family="Inter, system-ui, sans-serif" font-size="48" font-weight="700" fill="#0F172A" letter-spacing="-1.5">HIR</text><text x="118" y="46" font-family="Inter, system-ui, sans-serif" font-size="48" font-weight="400" fill="#475569" letter-spacing="-0.5">Restaurant Suite</text></svg>`;
  }

  const glyphFill = variant === 'dark' ? '#FFFFFF' : '#4F46E5';
  const wordFill = variant === 'dark' ? '#FFFFFF' : '#0F172A';
  const subFill = variant === 'dark' ? '#C7D2FE' : '#475569';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 80" width="270" height="60" role="img" aria-label="HIR Restaurant Suite"><rect x="0" y="8" width="64" height="64" rx="14" fill="${glyphFill}"/><text x="32" y="56" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="40" font-weight="700" fill="${variant === 'dark' ? '#0F172A' : '#FFFFFF'}">H</text><text x="80" y="44" font-family="Inter, system-ui, sans-serif" font-size="32" font-weight="700" fill="${wordFill}" letter-spacing="-0.8">HIR</text><text x="80" y="68" font-family="Inter, system-ui, sans-serif" font-size="16" font-weight="500" fill="${subFill}">Restaurant Suite</text></svg>`;
}

// Placeholder SVG for product screenshots until real captures land.
// Styled as a fake browser chrome with the route name + caption — enough
// to communicate "this would be the storefront / admin / etc." in press
// articles and PDFs without shipping bitmap assets.
function ScreenshotPlaceholder({
  label,
  caption,
  accent,
}: {
  label: string;
  caption: string;
  accent: string;
}) {
  return (
    <figure className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
      <div className="aspect-[16/10] w-full bg-[#F8FAFC]">
        <svg
          viewBox="0 0 800 500"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
          role="img"
          aria-label={label}
        >
          <rect width="800" height="500" fill="#F8FAFC" />
          {/* Browser chrome */}
          <rect x="0" y="0" width="800" height="40" fill="#FFFFFF" />
          <rect x="0" y="39" width="800" height="1" fill="#E2E8F0" />
          <circle cx="20" cy="20" r="5" fill="#E2E8F0" />
          <circle cx="38" cy="20" r="5" fill="#E2E8F0" />
          <circle cx="56" cy="20" r="5" fill="#E2E8F0" />
          <rect x="100" y="12" width="500" height="16" rx="8" fill="#F1F5F9" />
          {/* Accent header */}
          <rect x="0" y="40" width="800" height="60" fill={accent} opacity="0.08" />
          <rect x="32" y="62" width="120" height="16" rx="4" fill={accent} />
          <rect x="600" y="62" width="80" height="16" rx="4" fill="#E2E8F0" />
          <rect x="700" y="62" width="60" height="16" rx="4" fill="#E2E8F0" />
          {/* Body cards */}
          <rect x="32" y="130" width="220" height="140" rx="8" fill="#FFFFFF" stroke="#E2E8F0" />
          <rect x="48" y="146" width="80" height="10" rx="2" fill="#E2E8F0" />
          <rect x="48" y="166" width="160" height="8" rx="2" fill="#F1F5F9" />
          <rect x="48" y="180" width="140" height="8" rx="2" fill="#F1F5F9" />
          <rect x="48" y="240" width="60" height="14" rx="3" fill={accent} />
          <rect x="272" y="130" width="220" height="140" rx="8" fill="#FFFFFF" stroke="#E2E8F0" />
          <rect x="288" y="146" width="80" height="10" rx="2" fill="#E2E8F0" />
          <rect x="288" y="166" width="160" height="8" rx="2" fill="#F1F5F9" />
          <rect x="288" y="180" width="140" height="8" rx="2" fill="#F1F5F9" />
          <rect x="288" y="240" width="60" height="14" rx="3" fill={accent} />
          <rect x="512" y="130" width="220" height="140" rx="8" fill="#FFFFFF" stroke="#E2E8F0" />
          <rect x="528" y="146" width="80" height="10" rx="2" fill="#E2E8F0" />
          <rect x="528" y="166" width="160" height="8" rx="2" fill="#F1F5F9" />
          <rect x="528" y="180" width="140" height="8" rx="2" fill="#F1F5F9" />
          <rect x="528" y="240" width="60" height="14" rx="3" fill={accent} />
          {/* Bottom rows */}
          <rect x="32" y="300" width="700" height="14" rx="3" fill="#E2E8F0" />
          <rect x="32" y="328" width="500" height="10" rx="2" fill="#F1F5F9" />
          <rect x="32" y="350" width="600" height="10" rx="2" fill="#F1F5F9" />
          <rect x="32" y="372" width="400" height="10" rx="2" fill="#F1F5F9" />
          <rect x="32" y="430" width="180" height="32" rx="6" fill={accent} />
          <text
            x="122"
            y="450"
            textAnchor="middle"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="13"
            fontWeight="600"
            fill="#FFFFFF"
          >
            {label}
          </text>
        </svg>
      </div>
      <figcaption className="border-t border-[#E2E8F0] px-4 py-3">
        <div className="text-sm font-semibold text-[#0F172A]">{label}</div>
        <div className="text-xs text-[#475569]">{caption}</div>
      </figcaption>
    </figure>
  );
}
