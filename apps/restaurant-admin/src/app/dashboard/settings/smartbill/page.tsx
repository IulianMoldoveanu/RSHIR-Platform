// SmartBill direct-API integration — OWNER-gated dashboard.
// Companion to /dashboard/settings/exports (CSV fallback).

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { readSmartbillSettings } from '@/lib/smartbill';
import { SmartbillClient } from './smartbill-client';

export const dynamic = 'force-dynamic';

type JobRow = {
  id: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  smartbill_invoice_id: string | null;
  smartbill_invoice_number: string | null;
  smartbill_invoice_series: string | null;
  error_text: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  order_id: string;
};

export default async function SmartbillSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('settings, name')
    .eq('id', tenant.id)
    .maybeSingle();
  const sb = readSmartbillSettings(tenantRow?.settings);

  // Probe the vault to tell the UI whether a token is on file. We cannot
  // (and never will) echo the value back; the indicator is boolean only.
  const sbAdmin = admin as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data: tokenProbe } = await sbAdmin.rpc('hir_read_vault_secret', {
    secret_name: `smartbill_api_token_${tenant.id}`,
  });
  const hasToken = typeof tokenProbe === 'string' && tokenProbe.length > 0;

  // smartbill_invoice_jobs is not yet in the generated supabase types
  // (migration 20260506_010_smartbill_integration.sql ships in this commit).
  // Cast through unknown so the call typechecks regardless.
  const sbJobs = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const { data: jobsRaw } = await sbJobs
    .from('smartbill_invoice_jobs')
    .select(
      'id, status, smartbill_invoice_id, smartbill_invoice_number, smartbill_invoice_series, error_text, attempts, created_at, updated_at, order_id',
    )
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(50);
  const jobs = (jobsRaw ?? []) as unknown as JobRow[];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          SmartBill — facturare automată
        </h1>
        <p className="max-w-3xl text-sm text-zinc-600">
          Conectați contul SmartBill al restaurantului și HIR va trimite
          automat factura pentru fiecare comandă livrată. Pentru export
          manual lunar (offline), folosiți pagina{' '}
          <a
            href="/dashboard/settings/exports"
            className="font-medium text-purple-700 hover:underline"
          >
            Export contabilitate
          </a>
          .
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot configura
          integrarea SmartBill.
        </div>
      )}

      <SmartbillClient
        tenantId={tenant.id}
        canEdit={role === 'OWNER'}
        settings={sb}
        hasToken={hasToken}
        jobs={jobs}
      />

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900">
          Cum obțineți tokenul API SmartBill
        </h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>
            Deschideți contul SmartBill și accesați <em>Cont → Conectare API</em>.
          </li>
          <li>
            Copiați tokenul API generat (este afișat doar la generare; păstrați-l
            într-un loc sigur).
          </li>
          <li>
            Reveniți pe această pagină, lipiți tokenul și apăsați
            <strong> „Testează conexiunea”</strong> înainte de a activa
            trimiterea automată.
          </li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Tokenul este stocat criptat în Supabase Vault. HIR nu îl afișează
          niciodată după salvare; pentru rotație, lipiți unul nou peste el.
        </p>
      </section>
    </div>
  );
}
