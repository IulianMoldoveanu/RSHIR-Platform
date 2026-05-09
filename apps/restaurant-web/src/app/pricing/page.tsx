import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { RoiCalculator } from '@/components/marketing/roi-calculator';
import { getLocale } from '@/lib/i18n/server';
import { marketingOgImageUrl } from '@/lib/seo-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lane EN-I18N PR D — canonical URL kept on the apex of the configured
// primary domain; alternates self-reference because the same URL serves
// RO + EN via cookie-based locale.
const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const PRICING_URL = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}/pricing`
  : 'https://hir-restaurant-web.vercel.app/pricing';

const OG_IMAGE = marketingOgImageUrl({
  title: 'Tarife — 2 lei pe comandă',
  subtitle: 'Fără abonament. Fără procent. Fără setup.',
  variant: 'pricing',
});

export const metadata: Metadata = {
  title: 'Tarife — HIR Restaurant Suite',
  description:
    '2 lei pe comandă. Un singur plan. Fără abonament, fără procent, fără setup. Instalare gratuită pentru primele 50 de restaurante.',
  alternates: {
    canonical: PRICING_URL,
    languages: { 'ro-RO': PRICING_URL, en: PRICING_URL, 'x-default': PRICING_URL },
  },
  openGraph: {
    title: 'Tarife — HIR Restaurant Suite',
    description:
      'Plătești doar pentru comenzile livrate. 2 lei pe comandă. Fără surprize.',
    type: 'website',
    locale: 'ro_RO',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Tarife HIR' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tarife — HIR Restaurant Suite',
    description: 'Plătești doar pentru comenzile livrate. 2 lei pe comandă.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

type CompareRow = {
  feature: string;
  hir: { good: boolean; label: string };
  glovo: { good: boolean; label: string };
  wolt: { good: boolean; label: string };
  gloriafood: { good: boolean; label: string };
};

const COMPARE: CompareRow[] = [
  {
    feature: 'Cost per comandă',
    hir: { good: true, label: '2 lei flat' },
    glovo: { good: false, label: '~30%' },
    wolt: { good: false, label: '~25-30%' },
    gloriafood: { good: true, label: '0% (dar fără livrare)' },
  },
  {
    feature: 'Livrare inclusă',
    hir: { good: true, label: 'Da (curier HIR)' },
    glovo: { good: true, label: 'Da' },
    wolt: { good: true, label: 'Da' },
    gloriafood: { good: false, label: 'Nu' },
  },
  {
    feature: 'White-label (brand propriu)',
    hir: { good: true, label: 'Da' },
    glovo: { good: false, label: 'Nu' },
    wolt: { good: false, label: 'Nu' },
    gloriafood: { good: true, label: 'Da' },
  },
  {
    feature: 'Datele clienților',
    hir: { good: true, label: 'Restaurant' },
    glovo: { good: false, label: 'Marketplace' },
    wolt: { good: false, label: 'Marketplace' },
    gloriafood: { good: true, label: 'Restaurant' },
  },
  {
    feature: 'CRM + loyalty + reviews',
    hir: { good: true, label: 'Inclus' },
    glovo: { good: false, label: 'Nu' },
    wolt: { good: false, label: 'Limitat' },
    gloriafood: { good: false, label: 'Limitat' },
  },
  {
    feature: 'Status 2027',
    hir: { good: true, label: 'Activ' },
    glovo: { good: true, label: 'Activ' },
    wolt: { good: true, label: 'Activ' },
    gloriafood: { good: false, label: 'Închis 30.04.2027' },
  },
];

export default function PricingPage() {
  const currentLocale = getLocale();
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/pricing" currentLocale={currentLocale} />

      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            Tarife
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            Plătești doar comenzile livrate. <span className="text-[#4F46E5]">2 lei.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            Fără abonament. Fără setup. Fără procent. Un singur tarif, simplu —
            2 lei pe comandă, indiferent de valoarea coșului.
          </p>
        </div>
      </section>

      {/* Pricing card — single tier */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <PriceCard
            tag="SINGURUL PLAN"
            title="HIR Direct"
            price="2 lei"
            priceSub="/ comandă"
            description="Pentru orice restaurant — folosește curierul HIR (propriu sau din rețeaua HIR) sau curierul tău."
            included={[
              'Curier HIR (propriu sau din rețeaua HIR)',
              'Storefront white-label cu brand propriu',
              'Importer GloriaFood inclus',
              'CRM + loyalty + reviews + rezervări',
              'Asistent zilnic cu sugestii pentru vânzări',
              'Notificări push + sunet pe dashboard',
              'Plăți card + cash la livrare',
              'Subdomeniu inclus sau domeniu propriu',
              'Suport tehnic prin email + telefon',
              'Implementare gratuită pentru primele 50 restaurante',
              '30 zile fără cost',
              'Fără abonament. Fără setup.',
            ]}
            cta={{ href: '/contact', label: 'Sună-mă echipa HIR' }}
            accent
          />
          <div className="flex flex-col justify-center rounded-lg border border-[#E2E8F0] bg-[#FAFAFA] p-7">
            <h3 className="text-lg font-semibold text-[#0F172A]">Simplu ca în piață</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#475569]">
              Plătești 2 lei pentru fiecare comandă livrată. La 30 de comenzi pe zi,
              costul HIR e 60 lei/zi. Glovo/Wolt îți rețineau ~500–700 lei/zi pe
              același volum.
            </p>
            <dl className="mt-6 space-y-3">
              <div className="flex justify-between border-b border-[#F1F5F9] pb-3 text-sm">
                <dt className="text-[#475569]">30 comenzi × 80 lei bon mediu</dt>
                <dd className="font-semibold text-[#0F172A]">2.400 RON/zi rulaj</dd>
              </div>
              <div className="flex justify-between border-b border-[#F1F5F9] pb-3 text-sm">
                <dt className="text-[#475569]">Comision Glovo ~25%</dt>
                <dd className="font-semibold text-red-600">−600 RON/zi</dd>
              </div>
              <div className="flex justify-between pb-3 text-sm">
                <dt className="text-[#475569]">Cost HIR (30 × 2 lei)</dt>
                <dd className="font-semibold text-emerald-700">60 RON/zi</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-[#94A3B8]">
              Economie estimată: ~540 RON/zi față de Glovo (la 30 comenzi × 80 lei).
              Calculele variază după volumul și bonul tău mediu real.
            </p>
          </div>
        </div>

        <p className="mt-8 text-xs text-[#94A3B8]">
          * Tarifele exclud TVA. Plata se face lunar pe factură SRL la sfârșitul
          fiecărei luni calendaristice. Fără minim, fără angajament — plătești doar
          comenzile efectiv livrate.
        </p>
      </section>

      {/* Comparison */}
      <section className="border-y border-[#E2E8F0] bg-white py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight">
            Comparație onestă cu alternativele
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-[#475569]">
            Nu ascundem nimic. Iată unde HIR e mai bun și unde nu.
          </p>
          <div className="mt-10 overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#FAFAFA]">
                  <th className="px-4 py-3 text-left font-semibold text-[#475569]">
                    Funcționalitate
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-[#4F46E5]">
                    HIR
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-[#475569]">
                    Glovo
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-[#475569]">
                    Wolt
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-[#475569]">
                    GloriaFood
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] bg-white">
                {COMPARE.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">
                      {row.feature}
                    </td>
                    <Cell {...row.hir} />
                    <Cell {...row.glovo} />
                    <Cell {...row.wolt} />
                    <Cell {...row.gloriafood} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Întrebări frecvente</h2>
        <div className="mt-8 divide-y divide-[#E2E8F0]">
          <Faq q="Există abonament sau setup fee?">
            Nu. Plătești doar 2 lei pe comandă. Fără setup, fără abonament,
            fără minim de comenzi. Dacă într-o lună nu ai livrări, plătești 0 RON.
          </Faq>
          <Faq q="Există procent din valoarea comenzii?">
            Niciodată. 2 lei e flat — la o comandă de 50 RON plătești 2 lei, la o
            comandă de 500 RON tot 2 lei.
          </Faq>
          <Faq q="Cum se face plata?">
            Lunar, pe factură SRL emisă de HIR &amp; BUILD YOUR DREAMS S.R.L. la
            sfârșitul fiecărei luni. Termen de plată 15 zile.
          </Faq>
          <Faq q="Cine plătește comisionul Stripe pentru plățile cu cardul?">
            Restaurantul. Stripe ia comisionul lor (~1.4-1.9% în SEPA), HIR nu pune
            niciun markup. Vezi exact ce iei pe transferul lunar.
          </Faq>
          <Faq q="Pot folosi curierul meu existent?">
            Da. Dacă ai deja echipă proprie de livrare, o folosești în continuare —
            plătești 2 lei/comandă pentru HIR, costul curierului tău rămâne al tău.
          </Faq>
          <Faq q="Există minim de comenzi pentru a folosi HIR?">
            Nu. Funcționează din prima comandă. Dacă luna asta livrezi 10 comenzi,
            plătești 20 RON. Atât.
          </Faq>
        </div>
      </section>

      {/* ROI calculator — Lane MARKETING-ROI 2026-05-06 */}
      <RoiCalculator />

      {/* CTA */}
      <section className="border-t border-[#E2E8F0] bg-[#0F172A] text-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
            Gata să faceți primul pas?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-[#CBD5E1] md:text-base">
            Implementare gratuită pentru primele 50 de restaurante. 30 zile fără cost.
            Plătești 2 lei pe comandă, doar dacă livrezi.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              Sună-mă echipa HIR
            </Link>
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-transparent px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              Încep singur — 30 zile gratis
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}

function Cell({ good, label }: { good: boolean; label: string }) {
  return (
    <td className="px-4 py-3 text-center">
      <div
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
          good ? 'text-emerald-700' : 'text-[#94A3B8]'
        }`}
      >
        {good ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <XCircle className="h-3.5 w-3.5" aria-hidden />
        )}
        {label}
      </div>
    </td>
  );
}

function PriceCard({
  tag,
  title,
  price,
  priceSub,
  description,
  included,
  cta,
  accent,
}: {
  tag: string;
  title: string;
  price: string;
  priceSub: string;
  description: string;
  included: string[];
  cta: { href: string; label: string };
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border bg-white p-7 ${
        accent ? 'border-[#C7D2FE] ring-1 ring-[#C7D2FE]' : 'border-[#E2E8F0]'
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#4F46E5]">
        {tag}
      </div>
      <h3 className="mt-1 text-xl font-semibold text-[#0F172A]">{title}</h3>
      <div
        className={`mt-5 text-4xl font-semibold leading-none tracking-tight ${
          accent ? 'text-[#4F46E5]' : 'text-[#0F172A]'
        }`}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {price}
      </div>
      <div className="mt-1 text-xs text-[#94A3B8]">{priceSub}</div>
      <p className="mt-4 text-sm leading-relaxed text-[#475569]">{description}</p>

      <ul className="mt-6 space-y-2.5 text-sm text-[#475569]">
        {included.map((p) => (
          <li key={p} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#4F46E5]" aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <Link
          href={cta.href}
          className={`inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium ${
            accent
              ? 'bg-[#4F46E5] text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]'
              : 'border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]'
          }`}
        >
          {cta.label}
        </Link>
      </div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-[#0F172A]">
        {q}
        <span className="text-[#94A3B8] transition-transform group-open:rotate-45">+</span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-[#475569]">{children}</p>
    </details>
  );
}
