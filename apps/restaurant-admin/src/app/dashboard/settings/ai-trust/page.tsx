import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { listTrustRowsForTenant } from '@/lib/agents/trust';
import { AGENT_CATALOG } from '@/lib/agents/catalog';
import { TrustTable } from './trust-table';

export const dynamic = 'force-dynamic';

export default async function AiTrustSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const rows = await listTrustRowsForTenant(tenant.id);

  // Project DB rows by composite key for fast lookup in the table.
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    byKey.set(`${r.agent_name}::${r.action_category}`, r);
  }

  // Compose: every catalog entry gets a row, with DB values overlaid when
  // present. Owner who has never visited this page sees the full default-
  // PROPOSE_ONLY grid.
  const composed = AGENT_CATALOG.map((def) => {
    const dbRow = byKey.get(`${def.agent}::${def.category}`);
    return {
      ...def,
      trustLevel: (dbRow?.trust_level ?? 'PROPOSE_ONLY') as
        | 'PROPOSE_ONLY'
        | 'AUTO_REVERSIBLE'
        | 'AUTO_FULL',
      approvalCount: dbRow?.approval_count ?? 0,
      rejectionCount: dbRow?.rejection_count ?? 0,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Calibrare încredere AI
        </h1>
        <p className="text-sm text-zinc-600">
          Spuneți AI-ului ce poate face singur și ce trebuie să aprobați
          dumneavoastră. Acțiunile destructive (modificare preț, ștergere
          produs, rambursare) rămân întotdeauna la aprobare.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica
          nivelurile de încredere.
        </div>
      )}

      <TrustTable
        canEdit={role === 'OWNER'}
        tenantId={tenant.id}
        entries={composed}
      />

      <section className="rounded-md border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
        <h2 className="mb-2 text-sm font-medium text-zinc-900">Cum funcționează</h2>
        <ul className="flex flex-col gap-1 list-disc pl-5">
          <li>
            <strong>Doar propune</strong> — AI pregătește acțiunea, dvs. o
            aprobați manual din pagina „Activitate AI”.
          </li>
          <li>
            <strong>Automat (cu revert)</strong> — AI execută imediat, dvs.
            puteți anula timp de 24h dintr-un click.
          </li>
          <li>
            <strong>Automat complet</strong> — AI execută fără revert. Folosit
            pentru acțiuni mici, repetitive (ex: descrieri).
          </li>
        </ul>
      </section>
    </div>
  );
}
