import { notFound } from 'next/navigation';
import { getDemoTenant } from '@/lib/demo/demo-tenant';
import { getMenuByTenant } from '@/lib/menu';
import { brandingFor } from '@/lib/tenant';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/storefront/locale-switcher';
import { DemoMenu } from './_components/demo-menu';
import { DemoCartBar } from './_components/demo-cart-bar';
import { DemoAccountButton } from './_components/demo-account-button';
import { DemoFulfillmentSwitch } from './_components/demo-fulfillment-switch';

export const metadata = {
  title: 'Demo interactiv — HIR for You',
  robots: { index: false, follow: false },
};

export default async function DemoStorefrontPage() {
  const tenant = await getDemoTenant();
  if (!tenant) notFound();

  const [categories, locale] = await Promise.all([getMenuByTenant(tenant.id), getLocale()]);
  const { logoUrl, coverUrl } = brandingFor(tenant.settings);

  return (
    <div className="min-h-screen bg-zinc-50 pb-24">
      <div className="relative h-40 w-full bg-zinc-200 sm:h-56">
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        )}
        {/* Scrim under the corner cluster: a cover photo can be light, and
            white pills on a bright photo were hard to spot. Same trick the real
            header uses. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/25 to-transparent"
        />
        {/* Language + account, top-right — the exact pairing and placement a
            real tenant gets (see tenant-header.tsx). Iulian, 2026-08-03: it has
            to be there "ca la orice tenant si in special pe ala demo", and the
            language flag has to be easy to spot. The demo is the shop window;
            anything a real storefront has and this doesn't reads as missing
            from the product. */}
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <LocaleSwitcher current={locale} ariaLabel={t(locale, 'header.switch_locale')} />
          <DemoAccountButton />
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4">
        {/* relative z-10: the cover above has `relative` positioning, which
            (even with z-index:auto) paints above static in-flow siblings —
            without this, the cover clipped the top of the avatar wherever
            the pull-up made them overlap.
            2026-08-02: the pull-up used to sit on this row, which dragged the
            tenant name up over the cover photo too — dark text on a dark
            photo, unreadable. It belongs on the avatar alone, which is how
            the real storefront header (tenant-header.tsx) already did it. */}
        <div className="relative z-10 flex items-end gap-3 sm:gap-4">
          {/* Logo slot at the real header's size (80/112px, 4px white ring,
              pulled up over the cover) instead of the 64px it was. This is the
              single most brand-carrying element on a storefront — a prospect
              looking at the demo has to see where their own logo goes. */}
          <div className="-mt-12 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-md sm:-mt-14 sm:h-28 sm:w-28">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={tenant.name}
                className="h-full w-full object-cover"
                loading="eager"
              />
            ) : (
              <span className="text-2xl font-bold tracking-tight text-zinc-900">
                {tenant.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              {tenant.name}
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Restaurant demo — click-through interactiv
            </p>
          </div>
        </div>

        <DemoFulfillmentSwitch />

        <DemoMenu categories={categories} />
      </div>

      <DemoCartBar tenantName={tenant.name} />
    </div>
  );
}
