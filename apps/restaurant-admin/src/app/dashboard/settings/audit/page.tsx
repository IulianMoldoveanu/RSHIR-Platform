import { ListChecks } from 'lucide-react';
import { EmptyState } from '@hir/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const ACTION_LABELS: Record<string, string> = {
  'order.status_changed': 'Status comandă schimbat',
  'order.cancelled': 'Comandă anulată',
  'branding.logo_uploaded': 'Logo încărcat',
  'branding.cover_uploaded': 'Imagine de copertă încărcată',
  'branding.color_changed': 'Culoare brand schimbată',
  'notifications.email_toggled': 'Notificări email modificate',
  'notifications.daily_digest_toggled': 'Raport zilnic modificat',
  'promo.created': 'Cod promo creat',
  'promo.deleted': 'Cod promo șters',
  'tenant.went_live': 'Restaurant pornit',
  'review.hidden': 'Recenzie ascunsă',
  'review.unhidden': 'Recenzie reafișată',
  'menu.sold_out_set': 'Marcat epuizat azi',
  'menu.sold_out_cleared': 'Disponibil din nou',
  'integration.provider_added': 'Furnizor integrare adăugat',
  'integration.provider_removed': 'Furnizor integrare șters',
  'integration.dispatched': 'Eveniment integrare trimis',
  'integration.webhook_received': 'Webhook integrare primit',
  'integration.api_key_created': 'Cheie API creată',
  'integration.api_key_revoked': 'Cheie API revocată',
};

const ENTITY_LABELS: Record<string, string> = {
  tenant: 'restaurant',
  order: 'comandă',
  review: 'recenzie',
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_user_id: string | null;
};

export default async function AuditLogPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  // audit_log not yet in regenerated types — cast through unknown for read.
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (k: string, v: unknown) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: AuditRow[] | null; error: unknown }>;
          };
        };
      };
    };
  };
  const { data: rowsRaw } = await sb
    .from('audit_log')
    .select('id, action, entity_type, entity_id, metadata, created_at, actor_user_id')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = rowsRaw ?? [];

  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => !!v)),
  );
  const actorEmails = new Map<string, string>();
  for (const id of actorIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    const email = data?.user?.email;
    if (email) actorEmails.set(id, email);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Jurnal acțiuni</h1>
        <p className="text-sm text-zinc-600">
          Ultimele 100 de modificări făcute de echipa restaurantului. Util pentru
          troubleshooting sau audit.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-10 w-10" />}
          title="Nicio acțiune înregistrată încă."
          description="Acțiunile de moderare, branding și integrări apar aici imediat ce apar."
        />
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-zinc-900">
                  {ACTION_LABELS[r.action] ?? r.action}
                </span>
                <span className="text-xs text-zinc-500">
                  {new Date(r.created_at).toLocaleString('ro-RO')}
                </span>
              </div>
              <div className="text-xs text-zinc-600">
                <span>
                  {r.actor_user_id
                    ? (actorEmails.get(r.actor_user_id) ?? r.actor_user_id.slice(0, 8))
                    : 'sistem'}
                </span>
                {r.entity_type && r.entity_id ? (
                  <span className="ml-3 font-mono text-zinc-500">
                    {ENTITY_LABELS[r.entity_type] ?? r.entity_type}:{r.entity_id.slice(0, 8)}
                  </span>
                ) : null}
              </div>
              {r.metadata && Object.keys(r.metadata).length > 0 ? (
                <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">
                  {JSON.stringify(r.metadata)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
