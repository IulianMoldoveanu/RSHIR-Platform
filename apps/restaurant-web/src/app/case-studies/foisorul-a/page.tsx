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
import { getLocale } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
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
  subtitle: '158 de produse migrate din GloriaFood în sub 5 minute. Brașov · 03.05.2026.',
  variant: 'case-study',
});

export const metadata: Metadata = {
  title: 'Foișorul A — primul restaurant HIR live | Studiu de caz',
  description:
    'Restaurant tradițional românesc din Brașov, migrat din GloriaFood pe 03.05.2026. 158 de produse importate în <5 minute, storefront white-label live, livrare proprie HIR.',
  // Lane EN-I18N PR D — same URL serves both locales (cookie-based).
  alternates: {
    canonical: ARTICLE_URL,
    languages: { 'ro-RO': ARTICLE_URL, en: ARTICLE_URL, 'x-default': ARTICLE_URL },
  },
  openGraph: {
    title: 'Foișorul A — primul restaurant HIR live',
    description:
      'Cum am migrat un restaurant brașovean cu 158 de produse din GloriaFood pe HIR în mai puțin de 5 minute.',
    url: ARTICLE_URL,
    type: 'article',
    locale: 'ro_RO',
    publishedTime: ARTICLE_PUBLISHED,
    authors: ['HIRforYOU'],
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Foișorul A — studiu de caz HIR' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Foișorul A — primul restaurant HIR live',
    description: '158 de produse migrate din GloriaFood în sub 5 minute.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

export default function FoisorulACaseStudyPage() {
  const locale = getLocale();
  const articleJsonLd = buildArticleJsonLd({
    headline: 'Foișorul A — primul restaurant HIR live',
    description:
      'Restaurant tradițional românesc din Brașov, migrat din GloriaFood pe 03.05.2026. 158 de produse importate în sub 5 minute, storefront white-label live, livrare proprie HIR.',
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
      <MarketingHeader active="/case-studies/foisorul-a" currentLocale={locale} />

      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            {t(locale, 'caseStudy.eyebrow')}
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            {t(locale, 'caseStudy.hero_title')}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            {t(locale, 'caseStudy.hero_body')}
          </p>

          <dl className="mt-12 grid gap-6 border-t border-[#F1F5F9] pt-8 sm:grid-cols-4">
            <Stat label={t(locale, 'caseStudy.stat1_label')} value={t(locale, 'caseStudy.stat1_value')} />
            <Stat label={t(locale, 'caseStudy.stat2_label')} value={t(locale, 'caseStudy.stat2_value')} />
            <Stat label={t(locale, 'caseStudy.stat3_label')} value={t(locale, 'caseStudy.stat3_value')} />
            <Stat
              label={t(locale, 'caseStudy.stat4_label')}
              value={t(locale, 'caseStudy.stat4_value')}
              sub={t(locale, 'caseStudy.stat4_sub')}
            />
          </dl>
        </div>
      </section>

      {/* Story sections */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Section
          eyebrow={t(locale, 'caseStudy.section1_eyebrow')}
          title={t(locale, 'caseStudy.section1_title')}
          body={t(locale, 'caseStudy.section1_body')}
        />

        <Section
          eyebrow={t(locale, 'caseStudy.section2_eyebrow')}
          title={t(locale, 'caseStudy.section2_title')}
          body={t(locale, 'caseStudy.section2_body')}
          bullets={[
            t(locale, 'caseStudy.section2_b1'),
            t(locale, 'caseStudy.section2_b2'),
            t(locale, 'caseStudy.section2_b3'),
            t(locale, 'caseStudy.section2_b4'),
            t(locale, 'caseStudy.section2_b5'),
          ]}
        />

        <Section
          eyebrow={t(locale, 'caseStudy.section3_eyebrow')}
          title={t(locale, 'caseStudy.section3_title')}
          body={t(locale, 'caseStudy.section3_body')}
          bullets={[
            t(locale, 'caseStudy.section3_b1'),
            t(locale, 'caseStudy.section3_b2'),
            t(locale, 'caseStudy.section3_b3'),
            t(locale, 'caseStudy.section3_b4'),
          ]}
          afterBody={
            <p className="mt-4 text-sm leading-relaxed text-[#475569]">
              {t(locale, 'caseStudy.section3_after')}
            </p>
          }
        />

        <Section
          eyebrow={t(locale, 'caseStudy.section4_eyebrow')}
          title={t(locale, 'caseStudy.section4_title')}
          body={t(locale, 'caseStudy.section4_body')}
        />
      </section>

      {/* Numbers row */}
      <section className="border-y border-[#E2E8F0] bg-white py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight">
            {t(locale, 'caseStudy.deliverables_title')}
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-[#475569]">
            {t(locale, 'caseStudy.deliverables_body')}
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Deliverable
              icon={<Database className="h-5 w-5" />}
              title={t(locale, 'caseStudy.d1_title')}
              body={t(locale, 'caseStudy.d1_body')}
            />
            <Deliverable
              icon={<Package className="h-5 w-5" />}
              title={t(locale, 'caseStudy.d2_title')}
              body={t(locale, 'caseStudy.d2_body')}
            />
            <Deliverable
              icon={<Clock className="h-5 w-5" />}
              title={t(locale, 'caseStudy.d3_title')}
              body={t(locale, 'caseStudy.d3_body')}
            />
            <Deliverable
              icon={<Users className="h-5 w-5" />}
              title={t(locale, 'caseStudy.d4_title')}
              body={t(locale, 'caseStudy.d4_body')}
            />
            <Deliverable
              icon={<CheckCircle2 className="h-5 w-5" />}
              title={t(locale, 'caseStudy.d5_title')}
              body={t(locale, 'caseStudy.d5_body')}
            />
            <Deliverable
              icon={<CheckCircle2 className="h-5 w-5" />}
              title={t(locale, 'caseStudy.d6_title')}
              body={t(locale, 'caseStudy.d6_body')}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#E2E8F0] bg-[#0F172A] text-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
            {t(locale, 'caseStudy.cta_title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-[#CBD5E1] md:text-base">
            {t(locale, 'caseStudy.cta_body')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              {t(locale, 'caseStudy.cta_primary')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-transparent px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              {t(locale, 'caseStudy.cta_secondary')}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter currentLocale={locale} />
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
    <div className="rounded-lg border border-[#E2E8F0] bg-[#FAFAFA] p-5">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[#0F172A]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#475569]">{body}</p>
    </div>
  );
}
