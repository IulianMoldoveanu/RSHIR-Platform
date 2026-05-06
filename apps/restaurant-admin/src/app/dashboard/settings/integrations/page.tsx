// RSHIR-52: Integrations settings page — OWNER-gated.
// Lists integration_providers and tenant_api_keys for the active tenant.

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { IntegrationsClient } from './client';
import { ExternalPlatformsCard } from './external-platforms-card';
import { EmbedWidgetCard } from './embed-widget-card';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();

  // Cast through unknown — integration tables not yet in generated types.
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const { data: providers } = await sb
    .from('integration_providers')
    .select('id, provider_key, display_name, is_active, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: true });

  const { data: apiKeys } = await sb
    .from('tenant_api_keys')
    .select('id, label, scopes, last_used_at, is_active, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: true });

  // Recent dispatch queue entries — gives the operator a clear view of which
  // outbound POS events succeeded/failed without leaving the integrations
  // page. Limit 50 keeps the page fast even on a busy tenant.
  const sbEvents = admin as unknown as {
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
  const { data: events } = await sbEvents
    .from('integration_events')
    .select('id, provider_key, event_type, status, attempts, last_error, scheduled_for, sent_at, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(50);

  // Storefront base URL — same env var used elsewhere in admin (e.g. reservations).
  const storefrontBase =
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hiraisolutions.ro';
  const gloriaFoodImportUrl = `${storefrontBase.replace(/\/$/, '')}/migrate-from-gloriafood`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Integrări</h1>
        <p className="text-sm text-zinc-600">
          Conectează sisteme POS externe și generează chei API pentru {tenant.name}.
        </p>
      </header>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Import din GloriaFood</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Importați meniul, clienții și comenzile din GloriaFood cu un fișier CSV.
              Procesul durează sub 5 minute.
            </p>
          </div>
          <a
            href={gloriaFoodImportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Importă acum
          </a>
        </div>
      </div>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot gestiona integrările.
        </div>
      )}

      <IntegrationsClient
        tenantId={tenant.id}
        canEdit={role === 'OWNER'}
        providers={(providers ?? []) as Array<{
          id: string;
          provider_key: string;
          display_name: string;
          is_active: boolean;
          created_at: string;
        }>}
        apiKeys={(apiKeys ?? []) as Array<{
          id: string;
          label: string;
          scopes: string[];
          last_used_at: string | null;
          is_active: boolean;
          created_at: string;
        }>}
        events={(events ?? []) as Array<{
          id: number;
          provider_key: string;
          event_type: string;
          status: 'PENDING' | 'SENT' | 'FAILED' | 'DEAD';
          attempts: number;
          last_error: string | null;
          scheduled_for: string;
          sent_at: string | null;
          created_at: string;
        }>}
      />

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              ANAF e-Factura — transmitere SPV
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Configurați transmiterea automată a facturilor către SPV. Este
              obligatoriu pentru toate facturile B2B și B2C emise de la
              1 ianuarie 2025.
            </p>
          </div>
          <a
            href="/dashboard/settings/efactura"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-purple-600 bg-white px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50"
          >
            Configurează ANAF
          </a>
        </div>
      </div>

      <ExternalPlatformsCard />

      <EmbedWidgetCard tenantId={tenant.id} tenantSlug={tenant.slug} />
    </div>
  );
}
