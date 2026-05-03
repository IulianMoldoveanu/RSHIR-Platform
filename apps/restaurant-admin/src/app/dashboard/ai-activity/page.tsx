import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import {
  isReversibleActionType,
  isWithin24h,
  listAgentRuns,
  type AgentRunStatus,
} from '@/lib/agents/runs';
import { ActivityList } from './activity-list';

export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  agent?: string;
  type?: string;
  from?: string;
  to?: string;
};

export default async function AiActivityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const status = parseStatus(searchParams.status);
  const agent = parseStr(searchParams.agent);
  const type = parseStr(searchParams.type);
  const from = parseDate(searchParams.from);
  const to = parseDate(searchParams.to);

  const runs = await listAgentRuns(
    tenant.id,
    {
      status: status ?? undefined,
      agentName: agent ?? undefined,
      actionType: type ?? undefined,
      fromDate: from ?? undefined,
      toDate: to ?? undefined,
    },
    100,
  );

  // Decorate with revertable flag — easier to compute server-side than to
  // re-derive on each click in the client.
  const decorated = runs.map((r) => ({
    ...r,
    revertable:
      r.status === 'EXECUTED' &&
      !r.reverted_at &&
      isWithin24h(r.created_at) &&
      isReversibleActionType(r.action_type),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Activitate AI
        </h1>
        <p className="text-sm text-zinc-600">
          Toate acțiunile AI pe restaurantul {tenant.name}: ce a propus, ce a
          executat și ce ați anulat. Anulare disponibilă 24h după execuție.
        </p>
      </header>

      <Filters
        currentStatus={status}
        currentAgent={agent}
        currentType={type}
        currentFrom={from}
        currentTo={to}
      />

      {decorated.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-900">Nimic încă.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Când AI-ul propune sau execută o acțiune, apare aici.
          </p>
        </div>
      ) : (
        <ActivityList tenantId={tenant.id} canRevert={role === 'OWNER'} runs={decorated} />
      )}
    </div>
  );
}

function parseStatus(raw: string | undefined): AgentRunStatus | null {
  if (!raw) return null;
  if (raw === 'PROPOSED' || raw === 'EXECUTED' || raw === 'REVERTED' || raw === 'REJECTED') {
    return raw;
  }
  return null;
}
function parseStr(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 64);
  return trimmed || null;
}
function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function Filters({
  currentStatus,
  currentAgent,
  currentType,
  currentFrom,
  currentTo,
}: {
  currentStatus: AgentRunStatus | null;
  currentAgent: string | null;
  currentType: string | null;
  currentFrom: string | null;
  currentTo: string | null;
}) {
  return (
    <form
      method="GET"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Status</span>
        <select
          name="status"
          defaultValue={currentStatus ?? ''}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="">toate</option>
          <option value="PROPOSED">Propusă</option>
          <option value="EXECUTED">Executată</option>
          <option value="REVERTED">Anulată</option>
          <option value="REJECTED">Respinsă</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Agent</span>
        <input
          name="agent"
          defaultValue={currentAgent ?? ''}
          placeholder="ex: menu"
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Tip acțiune</span>
        <input
          name="type"
          defaultValue={currentType ?? ''}
          placeholder="ex: menu.bulk_import"
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">De la</span>
        <input
          type="date"
          name="from"
          defaultValue={currentFrom ?? ''}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Până la</span>
        <input
          type="date"
          name="to"
          defaultValue={currentTo ?? ''}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Filtrează
        </button>
        <a
          href="/dashboard/ai-activity"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Resetează
        </a>
      </div>
    </form>
  );
}
