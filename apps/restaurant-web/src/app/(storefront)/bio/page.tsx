import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getTopItems } from '@/lib/menu';
import { buildItemSlug } from '@/lib/slug';
import { formatRon } from '@/lib/format';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return { title: 'HIR' };
  const url = `${tenantBaseUrl()}/bio`;
  return {
    title: t(locale, 'meta.bio_title_template', { name: tenant.name }),
    description: t(locale, 'meta.bio_description_template', { name: tenant.name }),
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
    openGraph: {
      title: tenant.name,
      description: t(locale, 'meta.bio_description_template', { name: tenant.name }),
      url,
      type: 'website',
      locale: locale === 'en' ? 'en_GB' : 'ro_RO',
    },
  };
}

export default async function BioPage() {
  const locale = getLocale();
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const items = await getTopItems(tenant.id, 8);

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white pb-10">
      <header className="mx-auto flex max-w-md flex-col items-center px-4 pt-10 text-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-zinc-100 shadow-md">
          {tenant.settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.settings.logo_url}
              alt={tenant.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl font-semibold text-zinc-900">
              {tenant.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">{tenant.name}</h1>
        <Link
          href="/"
          className="mt-1 text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-700"
        >
          {t(locale, 'bio.view_all_menu')}
        </Link>
      </header>

      <section className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-3 px-4">
        {items.length === 0 ? (
          <p className="col-span-2 py-10 text-center text-sm text-zinc-500">
            {t(locale, 'bio.menu_not_published')}
          </p>
        ) : (
          items.map((it) => (
            <Link
              key={it.id}
              href={`/m/${buildItemSlug(it)}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-square w-full bg-zinc-100">
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.image_url}
                    alt={it.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl">🍽️</div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <h2 className="line-clamp-1 text-sm font-semibold text-zinc-900">{it.name}</h2>
                <span className="mt-auto text-sm font-semibold tabular-nums text-zinc-900">
                  {formatRon(it.price_ron, locale)}
                </span>
              </div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
