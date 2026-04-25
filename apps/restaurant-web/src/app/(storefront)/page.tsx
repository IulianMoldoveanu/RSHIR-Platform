import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getMenuByTenant } from '@/lib/menu';
import { TenantHeader } from '@/components/storefront/tenant-header';
import { MenuRow } from '@/components/storefront/menu-row';

export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return { title: 'HIR Restaurant' };
  return {
    title: `${tenant.name} — comandă online`,
    description: `Comandă online direct de la ${tenant.name}.`,
    openGraph: {
      title: tenant.name,
      description: `Comandă online direct de la ${tenant.name}.`,
      images: tenant.settings.cover_url ? [{ url: tenant.settings.cover_url }] : undefined,
      type: 'website',
    },
  };
}

export default async function StorefrontHomePage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const menu = await getMenuByTenant(tenant.id);

  return (
    <main className="min-h-screen bg-zinc-50 pb-10">
      <TenantHeader
        name={tenant.name}
        logoUrl={tenant.settings.logo_url ?? null}
        coverUrl={tenant.settings.cover_url ?? null}
        whatsappPhone={tenant.settings.whatsapp_phone ?? null}
      />

      <div className="mx-auto max-w-2xl">
        {menu.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            Meniul nu e încă publicat.
          </p>
        ) : (
          menu.map((cat) => <MenuRow key={cat.id} category={cat} />)
        )}
      </div>
    </main>
  );
}
