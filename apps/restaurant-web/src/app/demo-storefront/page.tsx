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
import { DemoLogoSlot } from './_components/demo-logo-slot';

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
          <DemoCartButton />
          <DemoAccountButton />
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4">
        {/* Logo + name. The "Restaurant demo — click-through interactiv"
            caption that used to sit under the name is gone (Iulian,
            2026-08-04: "sa vreau sa dispara"). It was also the one line on
            this page with no counterpart in the real header —
            tenant-header.tsx puts rating + /bio links under the name, never
            free-form copy — so a prospect was reading demo scaffolding as if
            it were product. */}
        <DemoLogoSlot logoUrl={logoUrl} name={tenant.name} />

        <DemoFulfillmentSwitch />

        <DemoMenu categories={categories} locale={locale} />
      </div>

      <DemoCartBar tenantName={tenant.name} />
    </div>
  );
}
