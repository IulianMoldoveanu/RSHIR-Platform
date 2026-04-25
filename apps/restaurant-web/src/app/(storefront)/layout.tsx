import { notFound } from 'next/navigation';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { StorefrontShell } from '@/components/storefront/storefront-shell';
import { CartPill } from '@/components/storefront/cart-drawer';
import { HirFooter } from '@/components/storefront/hir-footer';
import { formatNextOpen, isAcceptingOrders, isOpenNow } from '@/lib/operations';

export const dynamic = 'force-dynamic';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const baseUrl = tenantBaseUrl();
  const accepting = isAcceptingOrders(tenant.settings);
  const openStatus = isOpenNow(tenant.settings);
  const pauseReason =
    (tenant.settings as { pause_reason?: string | null }).pause_reason ?? null;

  let closedReason: string | null = null;
  if (!accepting) {
    closedReason = pauseReason ?? 'Restaurantul nu acceptă comenzi acum.';
  } else if (!openStatus.open) {
    closedReason = openStatus.nextOpen
      ? `Închis acum. Deschidem ${formatNextOpen(openStatus.nextOpen)}.`
      : 'Închis acum.';
  }

  return (
    <StorefrontShell tenantId={tenant.id}>
      {children}
      <HirFooter />
      <CartPill siteUrl={baseUrl} closedReason={closedReason} />
    </StorefrontShell>
  );
}
