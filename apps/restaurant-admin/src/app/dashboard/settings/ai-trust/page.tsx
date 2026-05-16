import { ShieldCheck } from 'lucide-react';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { listTrustRows, type TrustRow } from '@/lib/ai/activity-queries';
import { TRUST_CATEGORIES, TRUST_LEVEL_LABELS, type AgentName, type TrustLevel } from '@/lib/ai/master-orchestrator-types';
import { TrustLevelSelect } from './trust-level-select';
import { AutoPromoteToggle } from './auto-promote-toggle';

export const dynamic = 'force-dynamic';

const AGENT_LABELS: Record<AgentName, string> = {
  master: 'Master',
  menu: 'Meniu',
  marketing: 'Marketing',
  ops: 'Operațiuni',
  cs: 'Service clienți',
  analytics: 'Analiză',
  finance: 'Financiar',
  compliance: 'Conformitate',
  growth: 'Creștere',
};

export default async function AiTrustPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const isOwner = role === 'OWNER';
  const rows = await listTrustRows(tenant.id);

  // Index existing rows by (agent, category) so we can render the canonical
  // catalog with current overrides merged in. Categories with no DB row
  // default to PROPOSE_ONLY.
  const lookup = new Map<string, TrustRow>();
  for (const r of rows) {
    lookup.set(`${r.agentName}|${r.actionCategory}`, r);
  }

  // Group canonical categories by agent for the UI sections.
  const byAgent: Record<string, typeof TRUST_CATEGORIES> = {};
  for (const meta of TRUST_CATEGORIES) {
    (byAgent[meta.agent] ??= []).push(meta);
  }
  const agentOrder: AgentName[] = ['menu', 'marketing', 'cs', 'ops', 'finance', 'analytics'];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
          <ShieldCheck className="h-5 w-5 text-purple-600" aria-hidden />
          Setări încredere AI
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Decideți pentru fiecare tip de acțiune dacă asistentul AI o aplică automat sau întâi cere
          aprobarea dumneavoastră. Acțiunile destructive (preț, ștergere) rămân întotdeauna pe
          aprobare manuală.
        </p>
        {!isOwner && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Doar proprietarul restaurantului poate modifica aceste setări.
          </p>
        )}
      </header>

      {agentOrder.map((agent) => {
        const cats = byAgent[agent];
        if (!cats || cats.length === 0) return null;
        return (
          <section key={agent} className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="text-base font-semibold text-zinc-900">{AGENT_LABELS[agent]}</h2>
            <ul className="mt-3 divide-y divide-zinc-100">
              {cats.map((meta) => {
                const existing = lookup.get(`${meta.agent}|${meta.category}`);
                const currentLevel: TrustLevel = existing?.trustLevel ?? 'PROPOSE_ONLY';
                return (
                  <li key={meta.category} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900">{meta.label}</p>
                      <p className="text-[11px] font-mono text-zinc-500">{meta.category}</p>
                      {meta.destructive && (
                        <p className="text-[11px] text-rose-700">
                          Acțiune destructivă — blocată la „{TRUST_LEVEL_LABELS.PROPOSE_ONLY}&rdquo;.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-none flex-col items-end">
                      <TrustLevelSelect
                        tenantId={tenant.id}
                        agent={meta.agent}
                        category={meta.category}
                        initial={currentLevel}
                        destructive={meta.destructive}
                        disabled={!isOwner}
                      />
                      <AutoPromoteToggle
                        tenantId={tenant.id}
                        agent={meta.agent}
                        category={meta.category}
                        initial={existing?.autoPromoteEligible ?? true}
                        destructive={meta.destructive}
                        disabled={!isOwner}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
