import { notFound } from 'next/navigation';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { StorefrontShell } from '@/components/storefront/storefront-shell';
import { CartPill } from '@/components/storefront/cart-drawer';
import { HirFooter } from '@/components/storefront/hir-footer';

export const dynamic = 'force-dynamic';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const baseUrl = tenantBaseUrl();

  return (
    <StorefrontShell tenantId={tenant.id}>
      {children}
      <HirFooter />
      <CartPill siteUrl={baseUrl} />
    </StorefrontShell>
  );
}
