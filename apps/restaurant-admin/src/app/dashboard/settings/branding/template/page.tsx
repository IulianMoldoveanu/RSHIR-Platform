// Lane THEMES (2026-05-06): theme picker for the 5 vertical templates that
// already ship in @hir/restaurant-templates but were never wired to the UI.
// OWNER-only mutation; existing tenants stay on NULL (default HIR look)
// until they explicitly opt in here.

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ALL_TEMPLATES } from '@hir/restaurant-templates';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { TemplatePickerClient } from './template-picker-client';

export const dynamic = 'force-dynamic';

export default async function TemplatePickerPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  // template_slug isn't yet in the generated supabase types — fetch via
  // a dynamic select string and read off the row directly. Same casting
  // pattern as setTemplateSlug in actions.ts.
  const admin = createAdminClient();
  const { data } = await (admin
    .from('tenants') as unknown as {
    select: (s: string) => {
      eq: (col: string, v: string) => {
        maybeSingle: () => Promise<{ data: { template_slug: string | null } | null }>;
      };
    };
  })
    .select('template_slug')
    .eq('id', tenant.id)
    .maybeSingle();

  const initialSlug = data?.template_slug ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard/settings/branding"
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Înapoi la Identitate vizuală
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Temă vizuală</h1>
        <p className="text-sm text-zinc-600">
          Alegeți tema verticală a restaurantului. Aplică automat o paletă de culori și două
          fonturi (titluri și text) pe storefront-ul public — fără cod, fără upload. Puteți
          oricând reveni la stilul implicit HIR.
        </p>
      </div>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot schimba tema vizuală.
        </div>
      )}

      <TemplatePickerClient
        tenantId={tenant.id}
        initialSlug={initialSlug}
        templates={ALL_TEMPLATES}
        canEdit={role === 'OWNER'}
      />
    </div>
  );
}
