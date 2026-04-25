import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronLeft } from 'lucide-react';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getItemByShortId } from '@/lib/menu';
import { shortIdFromSlug, buildItemSlug } from '@/lib/slug';
import { formatRon } from '@/lib/format';
import { ItemDetailActions } from '@/components/storefront/item-detail-actions';
import { WhatsAppShareButton } from '@/components/storefront/share-button';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

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

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
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
    alternates: { canonical: url },
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

export default async function ItemPage({ params }: { params: { slug: string } }) {
  const locale = getLocale();
  const loaded = await loadItem(params.slug);
  if (!loaded) notFound();
  const { tenant, item } = loaded;

  const baseUrl = tenantBaseUrl();
  const canonicalSlug = buildItemSlug(item);
  const url = `${baseUrl}/m/${canonicalSlug}`;

  return (
    <main className="min-h-screen bg-zinc-50 pb-32">
      <div className="relative">
        <div className="relative h-72 w-full overflow-hidden bg-zinc-100 sm:h-96">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt={item.name}
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl">🍽️</div>
          )}
        </div>
        <Link
          href="/"
          className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-md hover:text-zinc-900"
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
          <WhatsAppShareButton
            text={t(locale, 'item.share_message_template', { item: item.name, tenant: tenant.name })}
            url={url}
            label={t(locale, 'item.share_on_whatsapp')}
          />
        </div>

        <hr className="my-6 border-zinc-200" />

        <ItemDetailActions item={item} locale={locale} />
      </div>
    </main>
  );
}
