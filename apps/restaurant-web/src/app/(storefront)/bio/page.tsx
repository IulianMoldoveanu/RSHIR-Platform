import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, UtensilsCrossed } from 'lucide-react';
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
    <main
      className="min-h-screen pb-12"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--hir-brand) 10%, white) 0%, white 240px, white 100%)',
      }}
    >
      <header className="mx-auto flex max-w-md flex-col items-center px-4 pt-12 text-center">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-white shadow-lg ring-1 ring-zinc-100">
          {tenant.settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.settings.logo_url}
              alt={tenant.name}
              width={112}
              height={112}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-3xl font-semibold tracking-tight text-zinc-900">
              {tenant.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-900">
          {tenant.name}
        </h1>
        <Link
          href="/"
          className="group mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-zinc-900 px-4 text-xs font-semibold uppercase tracking-widest text-white shadow-sm transition-all hover:scale-[1.02] hover:bg-zinc-800 active:scale-[0.98] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
        >
          {t(locale, 'bio.view_all_menu')}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </header>

      <section className="mx-auto mt-10 grid max-w-md grid-cols-2 gap-3 px-4">
        {items.length === 0 ? (
          <p className="col-span-2 py-10 text-center text-sm text-zinc-500">
            {t(locale, 'bio.menu_not_published')}
          </p>
        ) : (
          items.map((it) => (
            <Link
              key={it.id}
              href={`/m/${buildItemSlug(it)}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-zinc-100">
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.image_url}
                    alt={it.name}
                    width={300}
                    height={300}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-300">
                    <UtensilsCrossed className="h-10 w-10" aria-hidden />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <h2 className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-900">
                  {it.name}
                </h2>
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
