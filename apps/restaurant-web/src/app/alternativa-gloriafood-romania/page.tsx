// SEO landing — exact long-tail "alternativa gloriafood romania". Per
// ChatGPT SEO audit 2026-05-10 priority #2. Targets discovery-intent
// queries from RO restaurant owners researching what comes after the
// GloriaFood shutdown (2027-04-30). Lighter than /migrate-from-gloriafood
// (which is the migration form flow); this page is keyword-rich, RO-only,
// and funnels the warm visitor to /migrate or /contact.
//
// RO-only by design: the target audience is RO restaurant patrons, the
// keyword is RO, and Google needs a single canonical RO content target —
// not Accept-Language-driven RO/EN switching that would hurt indexing.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, XCircle, Calendar, Phone, MessageCircle } from 'lucide-react';
import { headers } from 'next/headers';
import {
  canonicalBaseUrl,
  marketingOgImageUrl,
  organizationJsonLd,
  websiteJsonLd,
  localBusinessJsonLd,
  softwareApplicationJsonLd,
  faqPageJsonLd,
  breadcrumbJsonLd,
} from '@/lib/seo-marketing';
import { safeJsonLd } from '@/lib/jsonld';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/marketing-shell';

const SHUTDOWN_DATE = new Date('2027-04-30T23:59:59Z');

function daysUntilShutdown(): number {
  const diff = SHUTDOWN_DATE.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

const PAGE_TITLE = 'Alternativa GloriaFood pentru România — HIRforYOU';
const PAGE_DESCRIPTION =
  'GloriaFood se închide pe 30 aprilie 2027. HIRforYOU este alternativa românească pentru restaurante: site propriu, comenzi online, KDS, livrare și AI — 2 lei per comandă, fără comision procentual.';

export async function generateMetadata(): Promise<Metadata> {
  const host =
    (await headers()).get('x-hir-host') ?? (await headers()).get('host')?.split(':')[0] ?? '';
  const url = `${canonicalBaseUrl(host)}/alternativa-gloriafood-romania`;
  const ogImage = marketingOgImageUrl({
    title: 'Alternativa GloriaFood pentru România',
    subtitle: 'HIRforYOU — 2 lei per comandă, fără comision procentual',
    variant: 'migrate',
  });
  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, 'x-default': url },
    },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url,
      type: 'website',
      locale: 'ro_RO',
      images: [{ url: ogImage, width: 1200, height: 630, alt: PAGE_TITLE }],
    },
    twitter: {
      card: 'summary_large_image',
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
  };
}

const REASONS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Construit special pentru piața din România',
    body:
      'Lei, TVA românesc, formal "dumneavoastră", curieri locali, integrare ANAF e-Factura. Nu o adaptare a unei platforme americane — software românesc, scris pentru patroni români.',
  },
  {
    title: 'Site propriu, nu listare într-o aplicație',
    body:
      'Restaurantul dumneavoastră primește un magazin online sub propriul nume — nu o pagină pe Glovo, Wolt sau Bolt. Clienții vă rămân ai dumneavoastră, datele lor le păstrați.',
  },
  {
    title: '2 lei per comandă, nu comision procentual',
    body:
      'Plătiți 2 lei pentru fiecare comandă livrată — atât. Fără comision procentual din valoarea coșului. La o comandă medie de 80 lei, costul este sub 3% — față de tipic 25-30% pe agregatorii mari.',
  },
  {
    title: 'AI inclus, fără cost suplimentar',
    body:
      'Asistent AI care răspunde la întrebările clienților, sugerează produse, scrie meniul. Inclus din primul abonament, fără tier "Pro" sau add-on plătit separat.',
  },
];

type CompareRow = {
  feature: string;
  hir: string;
  hirGood: boolean;
  gf: string;
  gfGood: boolean;
};

const COMPARE: ReadonlyArray<CompareRow> = [
  {
    feature: 'Disponibilitate după 30 aprilie 2027',
    hir: 'În rulaj activ',
    hirGood: true,
    gf: 'Închis',
    gfGood: false,
  },
  {
    feature: 'Cost per comandă',
    hir: '2 lei (flat)',
    hirGood: true,
    gf: '0 lei (free) — dar fără AI și fără livrare proprie',
    gfGood: false,
  },
  {
    feature: 'AI integrat',
    hir: 'Inclus',
    hirGood: true,
    gf: 'Indisponibil',
    gfGood: false,
  },
  {
    feature: 'Curier propriu / flotă HIR',
    hir: 'Inclus',
    hirGood: true,
    gf: 'Indisponibil — depindeți de agregatori',
    gfGood: false,
  },
  {
    feature: 'Datele clienților',
    hir: 'Vă aparțin — export complet anytime',
    hirGood: true,
    gf: 'Pierdute la închidere',
    gfGood: false,
  },
  {
    feature: 'Migrare meniu',
    hir: 'GRATUITĂ — primele 50 de restaurante',
    hirGood: true,
    gf: 'N/A',
    gfGood: false,
  },
  {
    feature: 'Suport în română',
    hir: 'Echipă RO, formal "dumneavoastră"',
    hirGood: true,
    gf: 'Suport limitat în română',
    gfGood: false,
  },
];

const FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: 'De ce se închide GloriaFood în aprilie 2027?',
    answer:
      'Oracle a anunțat oficial sunset-ul produsului GloriaFood pentru 30 aprilie 2027. După această dată, butoanele "Comandă online" instalate pe site-urile restaurantelor nu vor mai funcționa, iar conturile administrative vor fi dezactivate. Restaurantele care folosesc GloriaFood au nevoie de o alternativă funcțională până atunci.',
  },
  {
    question: 'Care este alternativa GloriaFood pentru restaurantele din România?',
    answer:
      'HIRforYOU este platforma românească construită exact pentru acest scenariu: aceleași funcționalități (site propriu cu comandă online, fără comision procentual), plus modulele care lipseau pe GloriaFood (curier propriu, AI, KDS, integrare ANAF e-Factura). Migrarea meniului este gratuită pentru primele 50 de restaurante.',
  },
  {
    question: 'Cât costă HIRforYOU?',
    answer:
      '2 lei per comandă livrată. Fără abonament lunar, fără comision procentual din valoarea coșului. Pentru un restaurant cu 30 de comenzi pe zi (preț mediu 80 lei), costul HIR este aproximativ 1.800 lei pe lună — versus tipic 18.000-22.000 lei pe lună plătiți la Glovo/Wolt/Bolt pentru aceleași comenzi (în funcție de contractul cu agregatorul).',
  },
  {
    question: 'Cât durează migrarea de pe GloriaFood pe HIRforYOU?',
    answer:
      'Tipic 24-48 de ore. Echipa noastră preia meniul și configurarea curentă din GloriaFood, le importă în HIRforYOU și înlocuiește butonul de comandă pe site-ul dumneavoastră existent. Magazinul online merge fără întrerupere pentru clienți.',
  },
  {
    question: 'Pot păstra clienții și istoricul de comenzi?',
    answer:
      'Da. HIRforYOU nu păstrează date despre clienți închise în platformă: aveți acces la lista de email-uri, telefoane, istoricul de comenzi și export complet în orice moment. Datele rămân ale dumneavoastră, indiferent dacă rămâneți sau plecați.',
  },
];

export default async function AlternativaGloriaFoodRomaniaPage() {
  const host =
    (await headers()).get('x-hir-host') ?? (await headers()).get('host')?.split(':')[0] ?? '';
  const baseUrl = canonicalBaseUrl(host);
  const days = daysUntilShutdown();

  const orgLd = organizationJsonLd(baseUrl);
  const siteLd = websiteJsonLd(baseUrl);
  const localBusinessLd = localBusinessJsonLd(baseUrl);
  const softwareLd = softwareApplicationJsonLd(baseUrl);
  const faqLd = faqPageJsonLd(FAQ);
  const breadcrumbLd = breadcrumbJsonLd(baseUrl, [
    { name: 'HIRforYOU', path: '/' },
    { name: 'Alternativa GloriaFood pentru România', path: '/alternativa-gloriafood-romania' },
  ]);

  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(orgLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(siteLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(localBusinessLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(softwareLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }}
      />

      <MarketingHeader active="/alternativa-gloriafood-romania" currentLocale="ro" />

      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            <span>GloriaFood se închide în {days} de zile (30 aprilie 2027)</span>
          </div>
          <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            Alternativa GloriaFood pentru România —{' '}
            <span className="text-[#4F46E5]">HIRforYOU</span>
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-relaxed text-[#475569] md:text-lg">
            Restaurantele din România care folosesc GloriaFood au nevoie de o alternativă funcțională
            până la închiderea oficială pe 30 aprilie 2027. HIRforYOU este platforma românească de
            comenzi online — site propriu, KDS, curier, AI și integrare ANAF e-Factura, la 2 lei per
            comandă, fără comision procentual.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              Programează migrarea
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              Discutați cu echipa
            </Link>
          </div>
        </div>
      </section>

      {/* De ce HIRforYOU */}
      <section className="border-b border-[#E2E8F0] bg-[#FAFAFA]">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            De ce HIRforYOU este alternativa GloriaFood potrivită pentru România
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {REASONS.map((r) => (
              <article
                key={r.title}
                className="rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-sm"
              >
                <h3 className="text-base font-semibold text-[#0F172A]">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#475569]">{r.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            HIRforYOU vs. GloriaFood — comparație directă
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-[#475569]">
            Estimările de cost depind de contractul fiecărui restaurant cu agregatorul curent. Folosim
            mediile publicate de patronii din pilot (Brașov, București) pentru anul 2026.
          </p>
          <div className="mt-8 overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-4 py-3 text-left font-semibold text-[#475569]">Caracteristică</th>
                  <th className="px-4 py-3 text-center font-bold text-[#4F46E5]">HIRforYOU</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#475569]">GloriaFood</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {COMPARE.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-4 py-3 font-medium text-[#0F172A]">{row.feature}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        {row.hirGood ? (
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" aria-hidden />
                        )}
                        <span>{row.hir}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                        {row.gfGood ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" aria-hidden />
                        )}
                        <span>{row.gf}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-[#E2E8F0] bg-[#FAFAFA]">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Întrebări frecvente despre alternativa GloriaFood
          </h2>
          <div className="mt-8 space-y-5">
            {FAQ.map((item) => (
              <details
                key={item.question}
                className="group rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-sm"
              >
                <summary className="cursor-pointer list-none text-base font-semibold text-[#0F172A] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start justify-between gap-3">
                    <span>{item.question}</span>
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#EEF2FF] text-xs font-bold text-[#4F46E5] group-open:bg-[#4F46E5] group-open:text-white"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[#475569]">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Programați migrarea de pe GloriaFood pe HIRforYOU
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[#475569]">
            Nu așteptați 30 aprilie 2027. Migrarea durează 24-48 de ore și este GRATUITĂ pentru
            primele 50 de restaurante. Echipa noastră preia configurarea actuală și înlocuiește
            butonul de comandă pe site-ul dumneavoastră existent.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-6 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              Programează migrarea
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href="tel:+40743700916"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-6 py-3 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              <Phone className="h-4 w-4" aria-hidden />
              0743 700 916
            </a>
            <a
              href="https://wa.me/40743700916"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-6 py-3 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              WhatsApp
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale="ro" />
    </main>
  );
}
