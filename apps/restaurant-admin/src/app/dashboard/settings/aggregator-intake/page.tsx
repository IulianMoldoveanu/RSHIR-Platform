// Lane AGGREGATOR-EMAIL-INTAKE — PR 3 of 3.
// Setup wizard for forwarded order emails from Glovo / Wolt / Bolt Food.

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { AggregatorIntakeClient } from './client';

export const dynamic = 'force-dynamic';

const ORDERS_DOMAIN = process.env.NEXT_PUBLIC_AGGREGATOR_INTAKE_DOMAIN ?? 'orders.hir.ro';

export default async function AggregatorIntakeSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const admin = createAdminClient();
  // tenants.feature_flags is in the DB (migration 20260506_013) but not yet
  // in the generated supabase-types — cast through unknown.
  const tenantsSb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { feature_flags: Record<string, unknown> | null } | null;
          }>;
        };
      };
    };
  };

  const { data: tRow } = await tenantsSb
    .from('tenants')
    .select('feature_flags')
    .eq('id', tenant.id)
    .maybeSingle();
  const flags = (tRow?.feature_flags as Record<string, unknown> | null) ?? {};
  const enabled = flags.aggregator_email_intake_enabled === true;

  const aliasSb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { alias_local: string; enabled: boolean } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data: alias } = await aliasSb
    .from('aggregator_intake_aliases')
    .select('alias_local, enabled')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  const fullAddress = alias ? `${alias.alias_local}@${ORDERS_DOMAIN}` : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Preluare comenzi din aplicații (Glovo, Wolt, Bolt Food)
        </h1>
        <p className="text-sm text-zinc-600">
          Primiți comenzile din aplicații direct în panoul HIR — fără hardware POS, fără extensii.
          Setați un singur redirect din inbox-ul restaurantului către alias-ul HIR.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot activa preluarea email.
        </div>
      )}

      <AggregatorIntakeClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        canEdit={role === 'OWNER'}
        enabled={enabled}
        aliasAddress={fullAddress}
      />
    </div>
  );
}
