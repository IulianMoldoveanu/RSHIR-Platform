// HIR AI Tenant Orchestrator — copilot_agent_runs read helpers.
//
// Reads the universal AI ledger for the AI Activity page. Tables are
// not in generated types (bot repo owns the schema cadence) — same
// any-cast pattern as `lib/ai-ceo/queries.ts`.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type AgentRunStatus = 'PROPOSED' | 'EXECUTED' | 'REVERTED' | 'REJECTED';

export type AgentRunRow = {
  id: string;
  agent_name: string | null;
  action_type: string | null;
  status: AgentRunStatus;
  summary: string | null;
  payload: unknown;
  created_at: string | null;
  approved_at: string | null;
  reverted_at: string | null;
  reverted_reason: string | null;
  parent_run_id: string | null;
};

export type ListAgentRunsFilters = {
  status?: AgentRunStatus;
  agentName?: string;
  actionType?: string;
  // YYYY-MM-DD; inclusive bounds in UTC.
  fromDate?: string;
  toDate?: string;
};

const TABLE = 'copilot_agent_runs';

export async function listAgentRuns(
  restaurantId: string,
  filters: ListAgentRunsFilters = {},
  limit = 100,
): Promise<AgentRunRow[]> {
  try {
    const admin = createAdminClient() as any;
    let q = admin
      .from(TABLE)
      .select(
        'id, agent_name, action_type, status, summary, payload, created_at, approved_at, reverted_at, reverted_reason, parent_run_id, metadata',
      )
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters.status) q = q.eq('status', filters.status);
    if (filters.agentName) q = q.eq('agent_name', filters.agentName);
    if (filters.actionType) q = q.eq('action_type', filters.actionType);
    if (filters.fromDate) q = q.gte('created_at', `${filters.fromDate}T00:00:00.000Z`);
    if (filters.toDate) q = q.lte('created_at', `${filters.toDate}T23:59:59.999Z`);

    const { data, error } = await q;
    if (error) {
      console.warn('[agent-runs] listAgentRuns failed', error.message);
      return [];
    }
    return (data ?? []).map((row: any) => ({
      id: String(row.id ?? ''),
      agent_name: row.agent_name ?? null,
      action_type: row.action_type ?? null,
      status: (row.status ?? 'EXECUTED') as AgentRunStatus,
      summary:
        row.summary ??
        (typeof row.metadata === 'object' && row.metadata !== null
          ? row.metadata.summary ?? null
          : null) ??
        null,
      payload: row.payload ?? null,
      created_at: row.created_at ?? null,
      approved_at: row.approved_at ?? null,
      reverted_at: row.reverted_at ?? null,
      reverted_reason: row.reverted_reason ?? null,
      parent_run_id: row.parent_run_id ?? null,
    }));
  } catch (err) {
    console.warn('[agent-runs] listAgentRuns threw', (err as Error).message);
    return [];
  }
}

export async function getAgentRun(
  restaurantId: string,
  runId: string,
): Promise<AgentRunRow | null> {
  try {
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from(TABLE)
      .select(
        'id, agent_name, action_type, status, summary, payload, created_at, approved_at, reverted_at, reverted_reason, parent_run_id, metadata',
      )
      .eq('restaurant_id', restaurantId)
      .eq('id', runId)
      .maybeSingle();
    if (error) {
      console.warn('[agent-runs] getAgentRun failed', error.message);
      return null;
    }
    if (!data) return null;
    const row: any = data;
    return {
      id: String(row.id ?? ''),
      agent_name: row.agent_name ?? null,
      action_type: row.action_type ?? null,
      status: (row.status ?? 'EXECUTED') as AgentRunStatus,
      summary:
        row.summary ??
        (typeof row.metadata === 'object' && row.metadata !== null
          ? row.metadata.summary ?? null
          : null) ??
        null,
      payload: row.payload ?? null,
      created_at: row.created_at ?? null,
      approved_at: row.approved_at ?? null,
      reverted_at: row.reverted_at ?? null,
      reverted_reason: row.reverted_reason ?? null,
      parent_run_id: row.parent_run_id ?? null,
    };
  } catch (err) {
    console.warn('[agent-runs] getAgentRun threw', (err as Error).message);
    return null;
  }
}

// 24h window check. Returns null if the run is reverted, executed >24h
// ago, or the action_type isn't reversible.
const REVERSIBLE_ACTIONS = new Set<string>([
  'menu.bulk_import',
  'menu.item.create',
  'menu.description.update',
  'menu.photo.upload',
  // The list grows as each sub-agent ships its inverse op. Keeping it
  // explicit (rather than "everything is reversible") is intentional —
  // the absence of an inverse op is a real risk.
]);

export function isWithin24h(createdAtIso: string | null): boolean {
  if (!createdAtIso) return false;
  const t = new Date(createdAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

export function isReversibleActionType(actionType: string | null): boolean {
  if (!actionType) return false;
  return REVERSIBLE_ACTIONS.has(actionType);
}
