import { ShieldCheck, DollarSign } from 'lucide-react';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { listTrustRows, type TrustRow } from '@/lib/ai/activity-queries';
import { TRUST_CATEGORIES, TRUST_LEVEL_LABELS, type AgentName, type TrustLevel } from '@/lib/ai/master-orchestrator-types';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_MONTHLY_BUDGET_CENTS } from '@/lib/ai-ceo/queries';
import { TrustLevelSelect } from './trust-level-select';
import { AutoPromoteToggle } from './auto-promote-toggle';
import { BudgetEditor } from './budget-editor';

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

// Resolves the current monthly budget for the AI cost gate. Same
// fallback behaviour as the `checkBudget` resolver in
// `_shared/agent-cost.ts` — keep these in sync.
async function loadMonthlyBudgetCents(tenantId: string): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();
    if (error || !data) return DEFAULT_MONTHLY_BUDGET_CENTS;
    const settings = (data.settings as Record<string, unknown>) ?? {};
    const ai = (settings.ai as Record<string, unknown>) ?? {};
    const raw = ai.monthly_budget_cents;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_MONTHLY_BUDGET_CENTS;
    return n;
  } catch {
    return DEFAULT_MONTHLY_BUDGET_CENTS;
  }
}

export default async function AiTrustPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const isOwner = role === 'OWNER';
  const [rows, monthlyBudgetCents] = await Promise.all([
    listTrustRows(tenant.id),
    loadMonthlyBudgetCents(tenant.id),
  ]);

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

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
              <DollarSign className="h-4 w-4 text-emerald-600" aria-hidden />
              Buget lunar AI
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Plafonul lunar pentru toate apelurile Anthropic. Când cheltuiala lunii curente
              depășește acest prag, dispatcher-ul refuză apeluri noi (excepție: agentul
              <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">master</code>
              continuă să răspundă). Vezi cheltuieli curente în
              <a href="/dashboard/ai-ceo" className="ml-1 font-medium text-purple-700 hover:underline">
                AI CEO
              </a>.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <BudgetEditor
            tenantId={tenant.id}
            initialCents={monthlyBudgetCents}
            disabled={!isOwner}
          />
        </div>
      </section>

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
