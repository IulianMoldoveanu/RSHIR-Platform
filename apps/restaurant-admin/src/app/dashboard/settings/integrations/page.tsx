// RSHIR-52: Integrations settings page — OWNER-gated.
// Lists integration_providers and tenant_api_keys for the active tenant.

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { IntegrationsClient } from './client';
import { ExternalPlatformsCard } from './external-platforms-card';

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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Integrări</h1>
        <p className="text-sm text-zinc-600">
          Conectează sisteme POS externe și generează chei API pentru {tenant.name}.
        </p>
      </header>

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

      <ExternalPlatformsCard />
    </div>
  );
}
