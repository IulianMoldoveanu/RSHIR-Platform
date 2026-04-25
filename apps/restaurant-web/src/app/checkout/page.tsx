import { notFound } from 'next/navigation';
import { resolveTenantFromHost } from '@/lib/tenant';
import { CheckoutClient } from './CheckoutClient';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = getLocale();
  const tenantPhone = readPhone(tenant.settings) ?? '';
  const pickup = readPickup(tenant.settings);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-zinc-400">{tenant.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, 'checkout.title')}</h1>
      </header>

      <CheckoutClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        tenantPhone={tenantPhone}
        pickupEnabled={pickup.enabled}
        pickupAddress={pickup.address}
        pickupLat={pickup.lat}
        pickupLng={pickup.lng}
        locale={locale}
      />
    </main>
  );
}

function readPhone(settings: unknown): string | null {
  if (settings && typeof settings === 'object') {
    const s = settings as Record<string, unknown>;
    const wa = typeof s.whatsapp_phone === 'string' ? s.whatsapp_phone : null;
    const ph = typeof s.phone === 'string' ? s.phone : null;
    return wa ?? ph ?? null;
  }
  return null;
}

function readPickup(settings: unknown): {
  enabled: boolean;
  address: string | null;
  lat: number | null;
  lng: number | null;
} {
  if (settings && typeof settings === 'object') {
    const s = settings as Record<string, unknown>;
    const enabled = typeof s.pickup_enabled === 'boolean' ? s.pickup_enabled : true;
    const address = typeof s.pickup_address === 'string' ? s.pickup_address : null;
    const lat = typeof s.location_lat === 'number' ? s.location_lat : null;
    const lng = typeof s.location_lng === 'number' ? s.location_lng : null;
    return { enabled, address, lat, lng };
  }
  return { enabled: true, address: null, lat: null, lng: null };
}
