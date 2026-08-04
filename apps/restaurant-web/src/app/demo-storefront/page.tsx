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
import { DemoCartButton } from './_components/demo-cart-button';
import { DemoFulfillmentSwitch } from './_components/demo-fulfillment-switch';
import { DemoCoverLogoMarker } from './_components/demo-cover-logo-marker';

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
        {/* Marks where the restaurant's own logo goes. Demo-only — a real
            storefront draws the tenant's `branding.cover_logo_url` at this
            exact offset, or nothing at all. */}
        <DemoCoverLogoMarker />
        {/* Language + account, top-right — the exact pairing and placement a
            real tenant gets (see tenant-header.tsx). Iulian, 2026-08-03: it has
            to be there "ca la orice tenant si in special pe ala demo", and the
            language flag has to be easy to spot. The demo is the shop window;
            anything a real storefront has and this doesn't reads as missing
            from the product. */}
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <LocaleSwitcher current={locale} ariaLabel={t(locale, 'header.switch_locale')} />
          <DemoCartButton />
          <DemoAccountButton />
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4">
        {/* relative z-10: the cover above has `relative` positioning, which
            (even with z-index:auto) paints above static in-flow siblings —
            without this, the cover clipped the top of the picture wherever
            the pull-up made them overlap.
            The pull-up belongs on the picture alone, not on this row: on the
            row it dragged the tenant name up over the cover photo too — dark
            text on a dark photo, unreadable. Same as tenant-header.tsx. */}
        <div className="relative z-10 flex items-end gap-3 sm:gap-4">
          {/* The profile picture, at the real header's size (80/112px, 4px
              white ring, pulled up over the cover). Deliberately NOT the place
              for a logo — that is the marker on the cover above. Iulian,
              2026-08-04: "logul vreau sa fie pozitionat undeva in stanga sus a
              paginii de coperta, nu pe poza de profil." */}
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
          {/* Name only. The "Restaurant demo — click-through interactiv"
              caption that used to sit under it is gone (Iulian, 2026-08-04:
              "sa vreau sa dispara"). It was also the one line on this page
              with no counterpart in the real header — tenant-header.tsx puts
              rating + /bio links under the name, never free-form copy — so a
              prospect was reading demo scaffolding as if it were product. */}
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              {tenant.name}
            </h1>
          </div>
        </div>

        <DemoFulfillmentSwitch />

        <DemoMenu categories={categories} locale={locale} />
      </div>

      <DemoCartBar tenantName={tenant.name} />
    </div>
  );
}
