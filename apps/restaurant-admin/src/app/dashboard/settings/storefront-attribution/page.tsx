// /dashboard/settings/storefront-attribution
//
// Tenant-facing toggle for the "Powered by HIR" footer badge.
// Backend column: tenants.powered_by_hir_badge (default true → opt-out model).
// Visible badge component: apps/restaurant-web/src/components/storefront/powered-by-hir-badge.tsx

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { AttributionToggle } from './attribution-toggle';

export const dynamic = 'force-dynamic';

export default async function StorefrontAttributionPage() {
  const { tenant } = await getActiveTenant();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from('tenants')
    .select('powered_by_hir_badge')
    .eq('id', tenant.id)
    .maybeSingle();

  const currentlyEnabled =
    data?.powered_by_hir_badge === undefined ? true : Boolean(data.powered_by_hir_badge);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Setări
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Afișare „Powered by HIR" pe site
        </h1>
        <p className="text-sm text-zinc-600">
          Un rând mic în footer-ul site-ului tău public care leagă către pagina noastră pentru
          parteneri. E activat by default pentru toate restaurantele.
        </p>
      </header>

      <AttributionToggle initialEnabled={currentlyEnabled} />

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Cum arată badge-ul?</h2>
        <div className="rounded border border-zinc-200 bg-white py-2 text-center text-[11px] font-medium tracking-wide text-zinc-400">
          Powered by HIR — restaurantul tău poate primi comisioane cât face Glovo
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-600">
          Plasare: footer-ul fiecărei pagini publice a site-ului tău (sub branding-ul tău, separat
          vizual). Click-ul deschide pagina noastră de parteneri într-un tab nou — nu pierdem
          clienții tăi.
        </p>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-zinc-800">
        <h2 className="mb-2 text-sm font-semibold text-amber-900">De ce contează</h2>
        <ul className="space-y-1.5">
          <li>
            ● Atribuirea ne ajută să măsurăm impactul real și să continuăm să dezvoltăm HIR pentru
            restaurante mici și mijlocii din România.
          </li>
          <li>
            ● Fiecare restaurant nou care vine prin badge-ul tău devine parte din rețeaua HIR — și
            primești parte din comision dacă te înscrii și tu în programul de parteneri.
          </li>
          <li>
            ● Vezi{' '}
            <Link href="/parteneriat" className="font-medium text-amber-900 underline">
              parteneriat HIR
            </Link>{' '}
            pentru detalii.
          </li>
        </ul>
      </section>
    </div>
  );
}
