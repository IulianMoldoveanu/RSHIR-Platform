import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { ApiKeysClient, type ApiKeyRow } from './_components/api-keys-client';

export const dynamic = 'force-dynamic';

type RawKey = {
  id: string;
  key_prefix: string;
  label: string;
  scopes: string[];
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
};

export default async function ApiIntegrationPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: RawKey[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const { data: keys } = await sb
    .from('tenant_api_keys')
    .select('id, key_prefix, label, scopes, last_used_at, is_active, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false });

  const apiKeys: ApiKeyRow[] = (keys ?? []) as ApiKeyRow[];

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-zinc-500" aria-label="Breadcrumb">
        <Link href="/dashboard/settings/integrations" className="hover:text-zinc-800">
          Integrări
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-zinc-900 font-medium">API public comenzi</span>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          API public comenzi
        </h1>
        <p className="text-sm text-zinc-600">
          Trimite comenzi din site-ul sau aplicația ta direct în HIR prin{' '}
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-violet-700">
            POST /api/public/v1/orders
          </code>
          . Bearer token, rate-limit 60 req/min.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot gestiona cheile API.
        </div>
      )}

      {/* Payload schema */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Schema cererii</h2>
        <p className="mt-1 text-xs text-zinc-500 mb-3">
          Câmpurile marcate cu <span className="text-rose-600">*</span> sunt obligatorii.
        </p>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            ['customer.firstName *', 'string — max 80 caractere'],
            ['customer.phone *', 'string — format +40…'],
            ['items[] *', 'array min 1 — name, qty, priceRon'],
            ['totals.subtotalRon *', 'number ≥ 0'],
            ['totals.deliveryFeeRon *', 'number ≥ 0'],
            ['totals.totalRon *', 'number ≥ 0'],
            ['fulfillment', '"DELIVERY" (implicit) | "PICKUP"'],
            ['dropoff.line1 *', 'obligatoriu dacă fulfillment=DELIVERY'],
            ['dropoff.city *', 'string — min 2 caractere'],
            ['notes', 'string opțional — max 500 caractere'],
          ].map(([field, desc]) => (
            <div key={field} className="flex flex-col gap-0.5">
              <dt className="font-mono text-xs text-violet-700">{field}</dt>
              <dd className="text-xs text-zinc-500">{desc}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ApiKeysClient
        tenantId={tenant.id}
        canEdit={role === 'OWNER'}
        apiKeys={apiKeys}
      />
    </div>
  );
}
