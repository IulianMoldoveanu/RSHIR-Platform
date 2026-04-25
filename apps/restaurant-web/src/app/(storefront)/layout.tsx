import { notFound } from 'next/navigation';
import { brandingFor, resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { StorefrontShell } from '@/components/storefront/storefront-shell';
import { CartPill } from '@/components/storefront/cart-drawer';
import { HirFooter } from '@/components/storefront/hir-footer';
import { CookieConsent } from '@/components/legal/cookie-consent';
import { formatNextOpen, isAcceptingOrders, isOpenNow } from '@/lib/operations';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = getLocale();
  const baseUrl = tenantBaseUrl();
  const { brandColor } = brandingFor(tenant.settings);
  const accepting = isAcceptingOrders(tenant.settings);
  const openStatus = isOpenNow(tenant.settings);
  const pauseReason =
    (tenant.settings as { pause_reason?: string | null }).pause_reason ?? null;

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
          siteUrl={baseUrl}
          closedReason={closedReason}
          locale={locale}
        />
        <CookieConsent locale={locale} />
      </StorefrontShell>
    </div>
  );
}
