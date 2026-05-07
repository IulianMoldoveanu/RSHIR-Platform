// Self-serve Netopia (RO card gateway) configuration for restaurant OWNERs.
//
// Two modes per Iulian 2026-05-07:
//   MARKETPLACE — HIR is master merchant on Netopia; sub-merchant id per tenant.
//   STANDARD    — Each tenant has its own Netopia merchant credentials.
//
// V1 scope: scaffold form. Submission writes to psp_credentials (admin client,
// service-role bypasses RLS). Default `active = false` — Iulian flips it on
// after sandbox smoke. No "Test connection" button until V2 confirms the
// exact Netopia sandbox endpoint via WebFetch.
//
// OWNER-gated. Same pattern as the parent /dashboard/settings/payments page.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { NetopiaConfigClient } from './netopia-client';

export const dynamic = 'force-dynamic';

type CredentialsRow = {
  mode: 'MARKETPLACE' | 'STANDARD';
  signature: string | null;
  sub_merchant_id: string | null;
  live: boolean;
  active: boolean;
  // api_key_encrypted intentionally NOT loaded — never echo to UI
};

export default async function NetopiaSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  if (role !== 'OWNER') {
    redirect('/dashboard/settings/payments');
  }

  const admin = createAdminClient();

  // Cast through unknown — psp_credentials is freshly added and not yet
  // in generated Database types. Same pattern used elsewhere for
  // newly-shipped tables (see payments/page.tsx).
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: CredentialsRow | null; error: unknown }>;
          };
        };
      };
    };
  };

  const { data: row } = await sb
    .from('psp_credentials')
    .select('mode, signature, sub_merchant_id, live, active')
    .eq('tenant_id', tenant.id)
    .eq('provider', 'netopia')
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard/settings/payments"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          &larr; Înapoi la plăți
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-zinc-900">Configurare Netopia</h1>
      <p className="mt-2 text-sm text-zinc-700">
        Netopia este principalul procesator de carduri din România. Configurarea
        de mai jos vă permite să acceptați plăți cu cardul direct prin Netopia,
        cu sau fără un parteneriat de tip marketplace cu HIR.
      </p>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Status: scaffold V1.</strong> Adaptorul Netopia este integrat
        tehnic, dar dezactivat în producție până la finalizarea testelor în
        sandbox. Echipa HIR vă va anunța când puteți activa plățile.
      </div>

      <NetopiaConfigClient
        tenantId={tenant.id}
        initial={
          row
            ? {
                mode: row.mode,
                signature: row.signature ?? '',
                subMerchantId: row.sub_merchant_id ?? '',
                live: row.live,
                active: row.active,
              }
            : null
        }
      />
    </div>
  );
}
