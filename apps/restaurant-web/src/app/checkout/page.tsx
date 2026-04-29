import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { brandingFor, resolveTenantFromHost } from '@/lib/tenant';
import { readCustomerCookie } from '@/lib/customer-recognition';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getLoyaltyBalance } from '@/lib/loyalty';
import { CheckoutClient } from './CheckoutClient';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

// Pre-fill the form for known customers from their most recent order.
// Cuts ~5 fields off repeat-checkout flow (name, phone, email, street, city).
type PrefillData = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
};

async function loadPrefill(tenantId: string, customerId: string): Promise<PrefillData | null> {
  const admin = getSupabaseAdmin();
  const { data: cust } = await admin
    .from('customers')
    .select('first_name, last_name, phone, email')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!cust) return null;

  // Walk this customer's most recent orders and pick the first one that
  // had a delivery address; that's the address they're most likely to
  // re-use. Pickup-only customers fall through with empty address fields.
  const { data: lastOrder } = await admin
    .from('restaurant_orders')
    .select('delivery_address_id')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .not('delivery_address_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let line1 = '';
  let line2 = '';
  let city = '';
  let postalCode = '';
  if (lastOrder?.delivery_address_id) {
    const { data: addr } = await admin
      .from('customer_addresses')
      .select('line1, line2, city, postal_code')
      .eq('id', lastOrder.delivery_address_id)
      .maybeSingle();
    if (addr) {
      line1 = addr.line1 ?? '';
      line2 = addr.line2 ?? '';
      city = addr.city ?? '';
      postalCode = addr.postal_code ?? '';
    }
  }

  // Strip the +40 prefix the API stores so the input shows the bare 9-digit
  // local part — matches what the masked phone input expects.
  const phoneRaw = (cust.phone ?? '').replace(/\D/g, '');
  const phoneLocal = phoneRaw.startsWith('40')
    ? phoneRaw.slice(2)
    : phoneRaw.startsWith('0')
      ? phoneRaw.slice(1)
      : phoneRaw;

  return {
    firstName: cust.first_name ?? '',
    lastName: cust.last_name ?? '',
    phone: phoneLocal.slice(0, 9),
    email: cust.email ?? '',
    line1,
    line2,
    city,
    postalCode,
  };
}

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = getLocale();
  const tenantPhone = readPhone(tenant.settings) ?? '';
  const pickup = readPickup(tenant.settings);
  const { logoUrl } = brandingFor(tenant.settings);
  const codEnabled = tenant.settings.cod_enabled === true;

  const customerId = readCustomerCookie(tenant.id);
  const [prefill, loyalty] = await Promise.all([
    customerId ? loadPrefill(tenant.id, customerId) : Promise.resolve(null),
    customerId ? getLoyaltyBalance(tenant.id, customerId) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          aria-label={t(locale, 'checkout.back_to_menu')}
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={tenant.name}
            width={40}
            height={40}
            className="h-10 w-10 flex-none rounded-lg object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs uppercase tracking-widest text-zinc-400">{tenant.name}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {t(locale, 'checkout.title')}
          </h1>
        </div>
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
        codEnabled={codEnabled}
        prefill={prefill}
        loyalty={
          loyalty
            ? {
                balancePoints: loyalty.points,
                ronPerPoint: Number(loyalty.settings.ron_per_point),
                minPointsToRedeem: loyalty.settings.min_points_to_redeem,
                maxRedemptionPct: loyalty.settings.max_redemption_pct,
              }
            : null
        }
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
