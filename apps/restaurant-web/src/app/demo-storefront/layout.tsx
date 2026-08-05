import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getDemoTenant } from '@/lib/demo/demo-tenant';
import { brandingFor, themeFor } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

// Isolated from the real `(storefront)` layout on purpose: no
// `StorefrontShell`/`CartPill` (real-cart-coupled), no HirFooter/
// PoweredByHirBadge/CookieConsent chrome — this is a fake tenant existing
// only to be clicked through from hirforyou.ro. Applies the same
// `--hir-brand` CSS variable pattern as the real layout so item cards /
// buttons render on-brand.
//
// 2026-08-03 — the black "Demo interactiv — nicio comandă reală nu este
// trimisă" bar that used to sit above the header is gone, per Iulian. It was
// the first thing a prospect saw, and the point of this page is to look like a
// real shop. Nothing that could be mistaken for a real order loses its warning:
// the tenant name still reads "Restaurant demo — click-through interactiv", and
// the checkout still states plainly that nothing is charged and no restaurant
// is contacted, which is where it actually matters.
export default async function DemoStorefrontLayout({ children }: { children: ReactNode }) {
  const tenant = await getDemoTenant();
  if (!tenant) notFound();

  const { brandColor } = brandingFor(tenant.settings);
  const theme = themeFor(tenant.settings, tenant.template_slug);

  return (
    <div
      style={
        {
          ['--hir-brand' as never]: brandColor,
          ['--hir-accent' as never]: theme.accentColor,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
