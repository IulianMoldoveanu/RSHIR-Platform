import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Database,
  Package,
  Users,
  ArrowRight,
} from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { safeJsonLd } from '@/lib/jsonld';
import { marketingOgImageUrl } from '@/lib/seo-marketing';
import { buildArticleJsonLd, breadcrumbJsonLd } from '@/lib/seo/structured-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const CANONICAL_BASE = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}`
  : 'https://hir-restaurant-web.vercel.app';
const ARTICLE_URL = `${CANONICAL_BASE}/case-studies/foisorul-a`;
const ARTICLE_PUBLISHED = '2026-05-03T12:00:00+03:00';

const OG_IMAGE = marketingOgImageUrl({
  title: 'Foișorul A — primul restaurant HIR live',
  subtitle: '158 produse migrate din GloriaFood în sub 5 minute. Brașov · 03.05.2026.',
  variant: 'case-study',
});

export const metadata: Metadata = {
  title: 'Foișorul A — primul restaurant HIR live | Studiu de caz',
  description:
    'Restaurant tradițional românesc din Brașov, migrat din GloriaFood pe 03.05.2026. 158 produse importate în <5 minute, storefront white-label live, livrare proprie HIR.',
  alternates: { canonical: ARTICLE_URL },
  openGraph: {
    title: 'Foișorul A — primul restaurant HIR live',
    description:
      'Cum am migrat un restaurant brașovean cu 158 de produse din GloriaFood pe HIR în mai puțin de 5 minute.',
    url: ARTICLE_URL,
    type: 'article',
    locale: 'ro_RO',
    publishedTime: ARTICLE_PUBLISHED,
    authors: ['HIR Restaurant Suite'],
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Foișorul A — studiu de caz HIR' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Foișorul A — primul restaurant HIR live',
    description: '158 produse migrate din GloriaFood în sub 5 minute.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

export default function FoisorulACaseStudyPage() {
  const articleJsonLd = buildArticleJsonLd({
    headline: 'Foișorul A — primul restaurant HIR live',
    description:
      'Restaurant tradițional românesc din Brașov, migrat din GloriaFood pe 03.05.2026. 158 produse importate în sub 5 minute, storefront white-label live, livrare proprie HIR.',
    url: ARTICLE_URL,
    imageUrl: OG_IMAGE,
    datePublished: ARTICLE_PUBLISHED,
    publisherLogoUrl: `${CANONICAL_BASE}/logo.svg`,
  });
  const breadcrumb = breadcrumbJsonLd(CANONICAL_BASE, [
    { name: 'Acasă', path: '/' },
    { name: 'Studii de caz', path: '/case-studies/foisorul-a' },
    { name: 'Foișorul A', path: '/case-studies/foisorul-a' },
  ]);
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumb) }}
      />
      <MarketingHeader active="/case-studies/foisorul-a" />

      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            Studiu de caz · Brașov · Live din 03.05.2026
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            Foișorul A — primul restaurant HIR live.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            Restaurant tradițional românesc din Brașov, cu meniu mare și bază de
            clienți pe GloriaFood. Pilot anchor al platformei HIR. Importat în
            sub 5 minute, live cu storefront white-label și livrare proprie.
          </p>

          <dl className="mt-12 grid gap-6 border-t border-[#F1F5F9] pt-8 sm:grid-cols-4">
            <Stat label="Produse migrate" value="158" />
            <Stat label="Timp migrare" value="< 5 min" />
            <Stat label="Tarif comandă" value="3 RON" />
            <Stat label="Date client" value="100%" sub="rămân la restaurant" />
          </dl>
        </div>
      </section>

      {/* Story sections */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Section
          eyebrow="Context"
          title="Restaurant cu meniu mare, bază GloriaFood, comenzi prin telefon."
          body={`Foișorul A e un restaurant tradițional românesc din Brașov cu meniu de 158 de produse. Înainte de HIR, comenzile online treceau prin GloriaFood, iar livrările se făceau cu un curier propriu coordonat manual. Patronul gestiona telefonic comenzile și pierdea date despre clienți la fiecare interacțiune cu marketplace-uri externe.`}
        />

        <Section
          eyebrow="Provocare"
          title="GloriaFood se închide în 2027. Marketplace-urile iau 25-30%."
          body={`Oracle a anunțat oficial retragerea GloriaFood pe 30 aprilie 2027. Foișorul A trebuia să găsească o alternativă care:`}
          bullets={[
            'Importă rapid meniul de 158 de produse cu opțiuni complexe',
            'Permite brand propriu (white-label) — fără concurenți afișați alături',
            'Are livrare proprie cu cost predictibil, nu procent din valoare',
            'Păstrează datele clienților la restaurant',
            'Costă mai puțin de 25-30% pe care le ia un Glovo / Wolt',
          ]}
        />

        <Section
          eyebrow="Soluție"
          title="HIR Tier 1: 3 RON / livrare flat, white-label, importer GloriaFood."
          body={`Pe 03.05.2026 am pornit migrarea. Patronul Foișorul A a introdus cheia GloriaFood în panou, iar HIR a importat automat:`}
          bullets={[
            'Toate cele 158 de produse cu denumire, descriere, preț',
            'Categoriile + opțiunile (extra brânză, fără sare etc.)',
            'Imaginile produselor existente',
            'Configurația de livrare: zone, tarife, ore funcționare',
          ]}
          afterBody={
            <p className="mt-4 text-sm leading-relaxed text-[#475569]">
              În mai puțin de 5 minute, storefront-ul Foișorul A era live cu logo
              propriu, culoare proprie și un subdomeniu HIR. Comenzile încep să
              vină prin platforma HIR, livrate cu curier HIR la 3 RON / livrare flat.
            </p>
          }
        />

        <Section
          eyebrow="Rezultat"
          title="Live azi. Demo deschis pentru următoarele 3 restaurante din Brașov."
          body={`Foișorul A folosește acum platforma HIR pentru toate comenzile online. Patronul vede în dashboard real-time fiecare comandă, statistici zilnice generate de AI, lista clienților cu istoric — toate datele rămân la restaurant. Pe 04.05.2026, Iulian (CEO HIR) folosește Foișorul A ca demo live pentru următoarele restaurante din Brașov + București care intră în pipeline.`}
        />
      </section>

      {/* Numbers row */}
      <section className="border-y border-[#E2E8F0] bg-white py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight">
            Ce a primit Foișorul A
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-[#475569]">
            Inclus în tariful de 3 RON / livrare. Fără setup, fără abonament.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Deliverable
              icon={<Database className="h-5 w-5" />}
              title="Meniu complet importat"
              body="158 produse, categorii, opțiuni, imagini — totul automat din GloriaFood."
            />
            <Deliverable
              icon={<Package className="h-5 w-5" />}
              title="Storefront live cu brand propriu"
              body="Subdomeniu HIR cu logo, culoare, descriere proprie. Zero concurenți alături."
            />
            <Deliverable
              icon={<Clock className="h-5 w-5" />}
              title="Comenzi în timp real"
              body="Dashboard cu push + sunet la fiecare comandă. AI dedicat pentru analiză zilnică."
            />
            <Deliverable
              icon={<Users className="h-5 w-5" />}
              title="CRM client la restaurant"
              body="Telefon, email, istoric comenzi — toate la patron, nu la marketplace."
            />
            <Deliverable
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Livrare HIR la 3 RON flat"
              body="Curier propriu sau prin rețeaua HIR de flotă. Tarif fix indiferent de valoare."
            />
            <Deliverable
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Suport tehnic direct"
              body="Echipa HIR răspunde pe email + telefon. Fără call-center extern."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#E2E8F0] bg-[#0F172A] text-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
            Vrei aceeași migrare pentru restaurantul tău?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-[#CBD5E1] md:text-base">
            Conectezi cheia ta GloriaFood, în <strong>&lt; 5 minute</strong> ești live cu
            storefront propriu, exact ca Foișorul A.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              Începe migrarea
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-transparent px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              Programează demo
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
        {label}
      </dt>
      <dd
        className="mt-2 text-3xl font-semibold tracking-tight text-[#0F172A]"
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </dd>
      {sub && <dd className="mt-1 text-xs text-[#475569]">{sub}</dd>}
    </div>
  );
}

function Section({
  eyebrow,
  title,
  body,
  bullets,
  afterBody,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
  afterBody?: React.ReactNode;
}) {
  return (
    <article className="border-b border-[#E2E8F0] py-10 last:border-b-0">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#4F46E5]">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
        {title}
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-[#475569]">{body}</p>
      {bullets && (
        <ul className="mt-4 space-y-2 text-sm text-[#475569]">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 flex-none text-[#4F46E5]"
                aria-hidden
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {afterBody}
    </article>
  );
}

function Deliverable({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[#0F172A]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#475569]">{body}</p>
    </div>
  );
}
