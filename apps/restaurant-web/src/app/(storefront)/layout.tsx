import { cookies } from 'next/headers';
import { brandingFor, resolveTenantFromHost, themeFor } from '@/lib/tenant';
import { StorefrontShell } from '@/components/storefront/storefront-shell';
import { CartPill } from '@/components/storefront/cart-drawer';
import { EmptyCartCta } from '@/components/storefront/empty-cart-cta';
import { HirFooter } from '@/components/storefront/hir-footer';
import { CookieConsent } from '@/components/legal/cookie-consent';
import { formatNextOpen, isAcceptingOrders, isOpenNow } from '@/lib/operations';
import { getTopPopularItems } from '@/lib/menu';
import { isEmbedMode } from '@/lib/embed';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const { tenant } = await resolveTenantFromHost();
  // Lane H 2026-05-04: when no tenant resolves (canonical Vercel host with
  // no ?tenant= override and no custom-domain match) we pass `children`
  // through bare. The page itself decides whether to 404 (sub-routes that
  // require a tenant: account/bio/m/rezervari) or render the brand
  // marketing landing (root `page.tsx`). Storefront chrome (CartPill,
  // newsletter, cookie consent) is tenant-scoped so it stays gated below.
  if (!tenant) {
    return <>{children}</>;
  }

  const locale = getLocale();
  const { brandColor } = brandingFor(tenant.settings);

  // Theme picker wizard preview (2026-05-07): if the OWNER has the
  // `hir-theme-preview` cookie set to this tenant's ID (written by the
  // admin wizard's previewTheme server action), use theme_preview_slug
  // from settings instead of the live template_slug. Regular visitors
  // never have this cookie, so the guard keeps previews admin-only.
  const jar = cookies();
  const previewCookie = jar.get('hir-theme-preview')?.value ?? null;
  const isPreviewSession = previewCookie === tenant.id;
  const effectiveTemplateSlug = isPreviewSession
    ? ((tenant.settings as { theme_preview_slug?: string | null }).theme_preview_slug ??
       tenant.template_slug)
    : tenant.template_slug;

  // Lane THEMES (2026-05-06): resolve vertical-template tokens (accent +
  // heading/body fonts) on top of the legacy brand color. CSS vars below
  // let any storefront component opt in via var(--hir-accent),
  // var(--hir-font-heading), var(--hir-font-body). Components keep using
  // var(--hir-brand) unchanged.
  const theme = themeFor(tenant.settings, effectiveTemplateSlug);
  const FONT_VAR_BY_KEY: Record<string, string> = {
    inter: 'var(--font-sans)',
    playfair: 'var(--font-playfair)',
    'space-grotesk': 'var(--font-space-grotesk)',
    fraunces: 'var(--font-fraunces)',
    // Bold Urban style theme (2026-05-07): Oswald condensed headings.
    oswald: 'var(--font-oswald)',
  };
  const headingFontVar = FONT_VAR_BY_KEY[theme.headingFont] ?? 'var(--font-sans)';
  const bodyFontVar = FONT_VAR_BY_KEY[theme.bodyFont] ?? 'var(--font-sans)';
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

  // Lane Y5 (2026-05-05) — embed mode: hide HIR-branded footer + cookie
  // consent + PWA-install prompt when the storefront renders inside a
  // merchant-embedded iframe. Cart pill stays (it's commerce chrome,
  // not HIR chrome). The `hir-embed` class on the wrapper is also a
  // hook for future merchant CSS overrides if we ever expose them.
  const embed = isEmbedMode();

  return (
    <div
      data-hir-embed={embed ? '1' : undefined}
      data-hir-template={theme.templateSlug ?? undefined}
      className={embed ? 'hir-embed' : undefined}
      style={
        {
          ['--hir-brand' as never]: brandColor,
          ['--hir-accent' as never]: theme.accentColor,
          ['--hir-font-heading' as never]: headingFontVar,
          ['--hir-font-body' as never]: bodyFontVar,
          fontFamily: bodyFontVar,
        } as React.CSSProperties
      }
    >
      <StorefrontShell tenantId={tenant.id}>
        {children}
        {!embed && <HirFooter />}
        <CartPill
          closedReason={closedReason}
          locale={locale}
          minOrderRon={minOrderRon}
          freeDeliveryThresholdRon={freeDeliveryThresholdRon}
          upsellItems={upsellItems}
        />
        <EmptyCartCta locale={locale} />
        {!embed && <CookieConsent locale={locale} />}
      </StorefrontShell>
    </div>
  );
}
