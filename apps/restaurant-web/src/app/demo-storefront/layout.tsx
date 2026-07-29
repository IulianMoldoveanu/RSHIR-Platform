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
// buttons render on-brand, plus a persistent "DEMO" banner so nobody can
// mistake this for a real order flow.
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
      <div className="sticky top-0 z-50 bg-zinc-900 px-4 py-2 text-center text-xs font-semibold text-white">
        Demo interactiv — nicio comandă reală nu este trimisă
      </div>
      {children}
    </div>
  );
}
