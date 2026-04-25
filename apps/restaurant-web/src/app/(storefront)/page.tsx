import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getMenuByTenant } from '@/lib/menu';
import { TenantHeader } from '@/components/storefront/tenant-header';
import { MenuRow } from '@/components/storefront/menu-row';
import {
  formatNextOpen,
  isAcceptingOrders,
  isOpenNow,
} from '@/lib/operations';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await resolveTenantFromHost();
  const locale = getLocale();
  if (!tenant) return { title: t(locale, 'meta.default_title') };
  const description = t(locale, 'meta.home_description_template', { name: tenant.name });
  return {
    title: t(locale, 'meta.home_title_template', { name: tenant.name }),
    description,
    openGraph: {
      title: tenant.name,
      description,
      images: tenant.settings.cover_url ? [{ url: tenant.settings.cover_url }] : undefined,
      type: 'website',
      locale: locale === 'en' ? 'en_GB' : 'ro_RO',
    },
  };
}

export default async function StorefrontHomePage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = getLocale();
  const menu = await getMenuByTenant(tenant.id);
  const accepting = isAcceptingOrders(tenant.settings);
  const openStatus = isOpenNow(tenant.settings);
  const closed = !accepting || !openStatus.open;

  let banner: { title: string; detail?: string } | null = null;
  if (!accepting) {
    banner = {
      title: t(locale, 'home.banner_not_accepting_title'),
      detail:
        (tenant.settings as { pause_reason?: string | null }).pause_reason ?? undefined,
    };
  } else if (!openStatus.open) {
    banner = {
      title: t(locale, 'home.banner_closed_title'),
      detail: openStatus.nextOpen
        ? t(locale, 'home.banner_next_open_template', {
            when: formatNextOpen(openStatus.nextOpen, locale),
          })
        : undefined,
    };
  }

  return (
    <main className="min-h-screen bg-zinc-50 pb-10">
      <TenantHeader
        name={tenant.name}
        logoUrl={tenant.settings.logo_url ?? null}
        coverUrl={tenant.settings.cover_url ?? null}
        whatsappPhone={tenant.settings.whatsapp_phone ?? null}
        locale={locale}
      />

      {closed && banner && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">{banner.title}</p>
            {banner.detail && <p className="mt-0.5 text-xs">{banner.detail}</p>}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl">
        {menu.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            {t(locale, 'home.menu_not_published')}
          </p>
        ) : (
          menu.map((cat) => <MenuRow key={cat.id} category={cat} locale={locale} />)
        )}
      </div>
    </main>
  );
}
