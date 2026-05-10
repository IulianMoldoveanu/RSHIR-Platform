/// <reference types="react-dom/canary" />
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactDOM from 'react-dom';
import type { Metadata } from 'next';
import { ChevronLeft, UtensilsCrossed } from 'lucide-react';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getItemByShortId } from '@/lib/menu';
import { shortIdFromSlug, buildItemSlug } from '@/lib/slug';
import { formatRon } from '@/lib/format';
import { ItemDetailActions } from '@/components/storefront/item-detail-actions';
import { SocialShare } from '@/components/storefront/social-share';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { safeJsonLd } from '@/lib/jsonld';

export const dynamic = 'force-dynamic';

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

async function loadItem(slug: string) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return null;
  const shortId = shortIdFromSlug(slug);
  if (!shortId) return null;
  const item = await getItemByShortId(tenant.id, shortId);
  if (!item) return null;
  return { tenant, item };
}

export async function generateMetadata(
  props: {
    params: Promise<{ slug: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const locale = getLocale();
  const loaded = await loadItem(params.slug);
  if (!loaded) return { title: t(locale, 'meta.item_not_found') };
  const { tenant, item } = loaded;
  const baseUrl = tenantBaseUrl();
  const canonicalSlug = buildItemSlug(item);
  const url = `${baseUrl}/m/${canonicalSlug}`;
  const description = truncate(item.description ?? `${item.name} — ${formatRon(item.price_ron, locale)}`, 160);

  return {
    title: `${item.name} — ${tenant.name}`,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
    openGraph: {
      title: item.name,
      description,
      url,
      type: 'website',
      siteName: tenant.name,
      locale: locale === 'en' ? 'en_GB' : 'ro_RO',
      images: item.image_url ? [{ url: item.image_url, width: 1200, height: 630, alt: item.name }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: item.name,
      description,
      images: item.image_url ? [item.image_url] : [],
    },
    other: {
      'og:price:amount': item.price_ron.toString(),
      'og:price:currency': 'RON',
      'product:price:amount': item.price_ron.toString(),
      'product:price:currency': 'RON',
      'og:type': 'product',
    },
  };
}

export default async function ItemPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const locale = getLocale();
  const loaded = await loadItem(params.slug);
  if (!loaded) notFound();
  const { tenant, item } = loaded;

  // Lane PERF (2026-05-05) — preload the LCP item hero so the browser
  // starts the fetch before parsing <body>. The hero <img> below is
  // already loading="eager" + fetchPriority="high"; the preload hint
  // simply moves discovery earlier in the load timeline.
  if (item.image_url) {
    ReactDOM.preload(item.image_url, { as: 'image', fetchPriority: 'high' });
  }

  const baseUrl = tenantBaseUrl();
  const canonicalSlug = buildItemSlug(item);
  const url = `${baseUrl}/m/${canonicalSlug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MenuItem',
    name: item.name,
    description: item.description ?? undefined,
    image: item.image_url ?? undefined,
    url,
    offers: {
      '@type': 'Offer',
      price: item.price_ron.toFixed(2),
      priceCurrency: 'RON',
      availability: item.is_available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url,
    },
  };

  return (
    <main className="min-h-screen bg-zinc-50 pb-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <div className="relative">
        <div className="relative h-72 w-full overflow-hidden bg-zinc-100 sm:h-96">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            (<img
              src={item.image_url}
              alt={item.name}
              width={1200}
              height={800}
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
            />)
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-300">
              <UtensilsCrossed className="h-16 w-16" aria-hidden />
            </div>
          )}
          {/* Top scrim so the back chevron stays readable on bright
              photos. Bottom is intentionally clean — the title row sits
              right below the image. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 via-black/10 to-transparent"
          />
        </div>
        <Link
          href="/"
          className="absolute left-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-zinc-700 shadow-md backdrop-blur transition-all hover:bg-white hover:text-zinc-900 active:scale-[0.94] motion-reduce:active:scale-100"
          aria-label={t(locale, 'item.back')}
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
      </div>
      <div className="mx-auto max-w-2xl px-4 pt-5">
        <p className="text-xs uppercase tracking-widest text-zinc-500">{tenant.name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{item.name}</h1>
        <p className="mt-1 text-lg font-medium text-zinc-900">{formatRon(item.price_ron, locale)}</p>

        {item.description ? (
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">{item.description}</p>
        ) : null}

        <div className="mt-4">
          <SocialShare
            url={url}
            text={t(locale, 'item.share_message_template', { item: item.name, tenant: tenant.name })}
            tenantSlug={tenant.slug}
            labels={{
              share: t(locale, 'social.share_label'),
              whatsapp: t(locale, 'social.share_whatsapp'),
              facebook: t(locale, 'social.share_facebook'),
              twitter: t(locale, 'social.share_twitter'),
              telegram: t(locale, 'social.share_telegram'),
              copy: t(locale, 'social.copy_link'),
              copied: t(locale, 'social.link_copied'),
            }}
          />
        </div>

        <hr className="my-6 border-zinc-200" />

        <ItemDetailActions item={item} locale={locale} />
      </div>
    </main>
  );
}
