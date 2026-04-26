import { notFound } from 'next/navigation';
import { brandingFor, resolveTenantFromHost } from '@/lib/tenant';
import { StorefrontShell } from '@/components/storefront/storefront-shell';
import { CartPill } from '@/components/storefront/cart-drawer';
import { HirFooter } from '@/components/storefront/hir-footer';
import { CookieConsent } from '@/components/legal/cookie-consent';
import { formatNextOpen, isAcceptingOrders, isOpenNow } from '@/lib/operations';
import { getTopPopularItems } from '@/lib/menu';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = getLocale();
  const { brandColor } = brandingFor(tenant.settings);
  const accepting = isAcceptingOrders(tenant.settings);
  const openStatus = isOpenNow(tenant.settings);
  const pauseReason =
    (tenant.settings as { pause_reason?: string | null }).pause_reason ?? null;

  // Cart-upsell candidates: top-N popular items for the tenant. Fetched once
  // here (cart drawer is mounted on every storefront page); empty when the
  // tenant has no qualifying order history yet.
  const upsellItems = await getTopPopularItems(tenant.id);

  const settings = tenant.settings as Record<string, unknown> | null;
  const minOrderRon =
    typeof settings?.min_order_ron === 'number' && settings.min_order_ron > 0
      ? Number(settings.min_order_ron)
      : 0;
  const freeDeliveryThresholdRon =
    typeof settings?.free_delivery_threshold_ron === 'number' &&
    settings.free_delivery_threshold_ron > 0
      ? Number(settings.free_delivery_threshold_ron)
      : 0;

  let closedReason: string | null = null;
  if (!accepting) {
    closedReason = pauseReason ?? t(locale, 'layout.not_accepting');
  } else if (!openStatus.open) {
    closedReason = openStatus.nextOpen
      ? t(locale, 'layout.closed_now_template', {
          when: formatNextOpen(openStatus.nextOpen, locale),
        })
      : t(locale, 'layout.closed_now');
  }

  return (
    <div style={{ ['--hir-brand' as never]: brandColor }}>
      <StorefrontShell tenantId={tenant.id}>
        {children}
        <HirFooter />
        <CartPill
          closedReason={closedReason}
          locale={locale}
          minOrderRon={minOrderRon}
          freeDeliveryThresholdRon={freeDeliveryThresholdRon}
          upsellItems={upsellItems}
        />
        <CookieConsent locale={locale} />
      </StorefrontShell>
    </div>
  );
}
