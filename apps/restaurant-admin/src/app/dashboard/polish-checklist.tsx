import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

// RSHIR-42: post-onboarding polish nudge. The required-before-go-live items
// (menu + hours + zones) are already gated by RSHIR-23 / /dashboard/onboarding.
// This card surfaces nice-to-have items that improve the storefront after the
// tenant flipped `went_live`. Hidden entirely when all four items are done.

type Item = {
  done: boolean;
  label: string;
  href: string;
};

async function loadPolishItems(tenantId: string): Promise<Item[]> {
  const admin = createAdminClient();

  const [tenantRes, promoRes, paidRes] = await Promise.all([
    admin.from('tenants').select('settings').eq('id', tenantId).single(),
    admin
      .from('promo_codes')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    admin
      .from('restaurant_orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'PAID'),
  ]);

  const settings = (tenantRes.data?.settings as Record<string, unknown> | null) ?? {};
  const branding = (settings.branding as Record<string, unknown> | undefined) ?? {};
  const hasLogo = typeof branding.logo_url === 'string' && branding.logo_url.length > 0;
  const hasCover = typeof branding.cover_url === 'string' && branding.cover_url.length > 0;
  const hasPromo = (promoRes.count ?? 0) > 0;
  const hasPaidOrder = (paidRes.count ?? 0) > 0;

  return [
    { done: hasLogo, label: 'Adaugă un logo', href: '/dashboard/settings/branding' },
    { done: hasCover, label: 'Adaugă o imagine de copertă', href: '/dashboard/settings/branding' },
    { done: hasPromo, label: 'Creează primul cod promo', href: '/dashboard/promos' },
    { done: hasPaidOrder, label: 'Primește prima comandă plătită', href: '/dashboard/orders' },
  ];
}

export async function PolishChecklist({ tenantId }: { tenantId: string }) {
  const items = await loadPolishItems(tenantId);
  const remaining = items.filter((i) => !i.done);
  if (remaining.length === 0) return null;

  return (
    <section className="rounded-lg border border-purple-200 bg-purple-50 p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-purple-900">
          Continuă să-ți optimizezi restaurantul
        </h2>
        <span className="text-xs text-purple-700">
          {items.length - remaining.length}/{items.length}
        </span>
      </header>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-3">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                item.done
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-purple-300 bg-white text-purple-300'
              }`}
              aria-hidden
            >
              {item.done ? '✓' : ''}
            </span>
            {item.done ? (
              <span className="text-zinc-600 line-through">{item.label}</span>
            ) : (
              <Link href={item.href} className="text-purple-900 underline-offset-2 hover:underline">
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
