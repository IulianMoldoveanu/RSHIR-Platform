import { notFound } from 'next/navigation';
import { getDemoTenant } from '@/lib/demo/demo-tenant';
import { getMenuByTenant } from '@/lib/menu';
import { brandingFor } from '@/lib/tenant';
import { DemoMenu } from './_components/demo-menu';
import { DemoCartBar } from './_components/demo-cart-bar';

export const metadata = {
  title: 'Demo interactiv — HIR for You',
  robots: { index: false, follow: false },
};

export default async function DemoStorefrontPage() {
  const tenant = await getDemoTenant();
  if (!tenant) notFound();

  const [categories] = await Promise.all([getMenuByTenant(tenant.id)]);
  const { logoUrl, coverUrl } = brandingFor(tenant.settings);

  return (
    <div className="min-h-screen bg-zinc-50 pb-24">
      <div className="relative h-40 w-full bg-zinc-200 sm:h-56">
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" width={1200} height={400} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="mx-auto max-w-2xl px-4">
        <div className="-mt-8 flex items-end gap-3">
          <div className="h-16 w-16 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-sm">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={tenant.name} width={64} height={64} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--hir-brand)] text-lg font-bold text-white">
                {tenant.name.slice(0, 1)}
              </div>
            )}
          </div>
          <div className="pb-1">
            <h1 className="text-lg font-bold text-zinc-900">{tenant.name}</h1>
            <p className="text-xs text-zinc-500">Restaurant demo — click-through interactiv</p>
          </div>
        </div>

        <DemoMenu categories={categories} />
      </div>

      <DemoCartBar tenantName={tenant.name} />
    </div>
  );
}
